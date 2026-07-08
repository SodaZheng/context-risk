import { loadConfig } from './config.js'
import { appendEvent } from './events.js'
import {
  assessPostToolBatchRisk,
  assessPreToolRisk,
  bandForPercentage,
  isRiskManagementPrompt,
  shouldAllowPromptOverride
} from './risk.js'
import { loadState, saveSessionState } from './state.js'
/**
 * @param {Record<string, any>} input
 * @param {string=} home
 * @returns {Promise<Record<string, any> | undefined>}
 */
export async function handleHook(input, home) {
  switch (input.hook_event_name) {
    case 'UserPromptSubmit':
      return handleUserPromptSubmit(input, home)
    case 'PreToolUse':
      return handlePreToolUse(input, home)
    case 'PostToolBatch':
      return handlePostToolBatch(input, home)
    case 'Stop':
      return handleStop(input, home)
    case 'SubagentStop':
      return handleSubagentStop(input, home)
    case 'PreCompact':
      return recordCompactEvent(input, 'precompact', home)
    case 'PostCompact':
      return recordCompactEvent(input, 'postcompact', home)
    default:
      return undefined
  }
}

async function handleUserPromptSubmit(input, home) {
  const session = await getSession(input, home)
  if (!session) return undefined

  const config = await loadConfig(home)
  const observedPercentage = lastObservedUsedPercentage(session)
  const band = bandForPercentage(observedPercentage, config)

  if (band === 'notice' && !session.thresholdEvents.notice) {
    await markThreshold(session, 'notice', home)
    return {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: 'ContextRisk: last observed context usage is above 40%. Status line metrics can lag by one turn; continue with guardrails, avoid broad reads, and verify important claims with files or command output.'
      }
    }
  }

  if (band !== 'none' && band !== 'notice') {
    if (shouldAllowPromptOverride(input.prompt) || isRiskManagementPrompt(input.prompt)) return undefined
    await markThreshold(session, band, home)
    return {
      decision: 'block',
      reason: blockReason(band, observedPercentage)
    }
  }

  return undefined
}

async function handlePreToolUse(input, home) {
  const config = await loadConfig(home)
  const result = assessPreToolRisk(input, config)
  if (!result.block) return undefined

  await appendEvent({ type: 'pre_tool_block', reason: result.reason, toolName: input.tool_name }, home)
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: result.reason
    }
  }
}

async function handlePostToolBatch(input, home) {
  const config = await loadConfig(home)
  const result = assessPostToolBatchRisk(input, config)
  if (!result.block) return undefined

  await appendEvent({ type: 'post_tool_batch_block', totalChars: result.totalChars, reason: result.reason }, home)
  return {
    decision: 'block',
    reason: result.reason
  }
}

async function handleStop(input, home) {
  const session = await getSession(input, home)
  if (!session || input.stop_hook_active) return undefined

  const config = await loadConfig(home)
  const observedPercentage = lastObservedUsedPercentage(session)
  const band = bandForPercentage(observedPercentage, config)
  if (band === 'none' || band === 'notice' || session.checkpointEvents[band]) return undefined

  const now = new Date().toISOString()
  await saveSessionState({
    ...session,
    checkpointEvents: { ...session.checkpointEvents, [band]: now }
  }, home)

  return {
    hookSpecificOutput: {
      hookEventName: 'Stop',
      additionalContext: `ContextRisk checkpoint required: last observed context usage was ${Math.round(observedPercentage ?? 0)}%. Before finishing, write a concise checkpoint with current objective, completed work, changed files, validation, risks, and next step.`
    }
  }
}

async function handleSubagentStop(input, home) {
  const message = input.last_assistant_message ?? ''
  if (message.length <= 8000) return undefined

  await appendEvent({ type: 'subagent_output_block', agentType: input.agent_type, chars: message.length }, home)
  return {
    decision: 'block',
    reason: 'ContextRisk blocked a long subagent result. Return a structured summary under 1200 words with facts, files, risks, and next step. Do not paste large logs or file contents.'
  }
}

async function recordCompactEvent(input, type, home) {
  await appendEvent({
    type,
    sessionId: input.session_id,
    transcriptPath: input.transcript_path,
    trigger: input.trigger,
    compactSummary: input.compact_summary
  }, home)
  return undefined
}

async function getSession(input, home) {
  const state = await loadState(home)
  const sessionId = input.session_id ?? state.latestSessionId
  return sessionId ? state.sessions[sessionId] : undefined
}

async function markThreshold(session, band, home) {
  const now = new Date().toISOString()
  await saveSessionState({
    ...session,
    thresholdEvents: { ...session.thresholdEvents, [band]: session.thresholdEvents[band] ?? now }
  }, home)
}

function blockReason(band, observedPercentage) {
  const pct = Math.round(observedPercentage ?? 0)
  if (band === 'highRisk') {
    return `ContextRisk: last observed context usage was ${pct}%. High risk mode recommends checkpoint, /context-risk:handoff, or /context-risk:compact-plan only. Status line metrics can lag by one turn. To override, resend with "context-risk:continue".`
  }
  if (band === 'handoffRecommended') {
    return `ContextRisk: last observed context usage was ${pct}%. Start a clean window with /context-risk:handoff, or run /context-risk:compact-plan. Status line metrics can lag by one turn. To override, resend with "context-risk:continue".`
  }
  return `ContextRisk: last observed context usage was ${pct}%. Recommended: /context-risk:handoff or /context-risk:compact-plan before continuing. Status line metrics can lag by one turn. To override, resend with "context-risk:continue".`
}

function lastObservedUsedPercentage(session) {
  return session.lastObservedUsedPercentage ?? session.usedPercentage
}
