export function bandForPercentage(percentage, config) {
  if (typeof percentage !== 'number') return 'none'
  if (percentage >= config.thresholds.highRisk) return 'highRisk'
  if (percentage >= config.thresholds.handoffRecommended) return 'handoffRecommended'
  if (percentage >= config.thresholds.softBlock) return 'softBlock'
  if (percentage >= config.thresholds.notice) return 'notice'
  return 'none'
}

export function shouldAllowPromptOverride(prompt) {
  return Boolean(prompt?.trim().startsWith('context-risk:continue'))
}

export function isRiskManagementPrompt(prompt) {
  const value = prompt?.trim() ?? ''
  return value.startsWith('/context-risk:handoff') ||
    value.startsWith('/context-risk:continue') ||
    value.startsWith('/context-risk:compact-plan') ||
    value.startsWith('/context-risk:risk-check') ||
    value.startsWith('/compact')
}

export function measureToolBatchChars(input) {
  return (input.tool_calls ?? []).reduce((total, call) => total + serializedLength(call.tool_response), 0)
}

export function assessPreToolRisk(input, config) {
  if (input.tool_name === 'Bash') {
    const command = String(input.tool_input?.command ?? '')
    if (/^\s*find\s+\/\s/.test(command)) {
      return { block: true, reason: 'ContextRisk blocked broad `find /`; use a project path and a narrow predicate.' }
    }
    if (/^\s*cat\s+\S+/.test(command) && !/\|\s*(head|sed|tail)\b/.test(command)) {
      return { block: true, reason: 'ContextRisk blocked unbounded `cat`; use `sed -n`, `head`, or a targeted search.' }
    }
    if (/^\s*rg\s+\S+\s+\.?\s*$/.test(command) && !/--max-count|-m\s+\d+|--files/.test(command)) {
      return { block: true, reason: 'ContextRisk blocked broad `rg`; add a path, file glob, or --max-count.' }
    }
  }

  if (input.tool_name === 'Read') {
    const filePath = String(input.tool_input?.file_path ?? '')
    if (/\.(lock|log|min\.js|map)$/.test(filePath)) {
      return { block: true, reason: `ContextRisk blocked high-volume read of ${filePath}; summarize or search targeted lines first.` }
    }
  }

  void config
  return { block: false }
}

export function assessPostToolBatchRisk(
  input,
  config
) {
  const totalChars = measureToolBatchChars(input)
  if (totalChars > config.maxToolBatchCharsBeforeBlock) {
    return {
      block: true,
      totalChars,
      reason: `ContextRisk stopped before the next model call because this tool batch returned ${totalChars} characters. Create a concise summary, handoff, or compact before continuing.`
    }
  }
  return { block: false, totalChars }
}

function serializedLength(value) {
  if (typeof value === 'string') return value.length
  if (value === undefined || value === null) return 0
  return JSON.stringify(value).length
}
