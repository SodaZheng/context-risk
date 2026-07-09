import { readFile } from 'node:fs/promises'

const maxItems = 8

export async function summarizeTranscript(transcriptPath) {
  if (!transcriptPath || transcriptPath === 'unknown') return undefined

  let raw
  try {
    raw = await readFile(transcriptPath, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }

  const events = parseJsonl(raw)
  if (events.length === 0) return undefined

  const humanPrompts = []
  const assistantTexts = []
  const awaySummaries = []
  const keyFiles = new Map()
  const commands = []
  let toolCallCount = 0

  for (const event of events) {
    if (isHumanPrompt(event)) {
      const prompt = normalizeText(contentToText(event.message?.content))
      if (prompt) humanPrompts.push(prompt)
    }

    if (event.type === 'system' && event.subtype === 'away_summary') {
      const summary = normalizeText(event.content)
      if (summary) awaySummaries.push(summary)
    }

    const content = Array.isArray(event.message?.content) ? event.message.content : []
    if (event.type === 'assistant') {
      for (const item of content) {
        if (item.type === 'text') {
          const text = normalizeText(item.text)
          if (text) assistantTexts.push(text)
          continue
        }

        if (item.type === 'tool_use') {
          toolCallCount += 1
          collectToolFiles(item, keyFiles)

          if (item.name === 'Bash' && item.input?.command) {
            commands.push({
              id: item.id,
              command: normalizeText(item.input.command),
              description: normalizeText(item.input.description),
              result: ''
            })
          }
        }
      }
    }

    for (const result of content.filter(item => item.type === 'tool_result')) {
      const command = commands.find(item => item.id === result.tool_use_id)
      if (command) command.result = summarizeToolResult(result.content)
    }
  }

  const latestAwaySummary = awaySummaries.at(-1)
  const currentObjective = extractGoal(latestAwaySummary) ?? extractObjectiveFromPrompts(humanPrompts)
  const nextStep = extractNextStep(latestAwaySummary)
  const completedWork = completedItems(latestAwaySummary, assistantTexts)
  const unfinishedTodos = todoItems(latestAwaySummary, nextStep, assistantTexts)
  const risks = riskItems(latestAwaySummary, humanPrompts)

  return {
    currentObjective,
    completedWork,
    unfinishedTodos,
    keyDecisions: decisionItems(humanPrompts, latestAwaySummary),
    keyFiles: [...keyFiles.values()].slice(0, maxItems),
    commandsAndResults: commands.filter(isUsefulCommand).slice(-maxItems).map(formatCommandResult),
    verifiedFacts: verifiedItems(latestAwaySummary, commands.filter(isUsefulCommand), toolCallCount),
    unverifiedAssumptions: [
      'This handoff is extracted heuristically from the local transcript; the next window should verify current files and git state before editing.'
    ],
    knownRisks: risks,
    recommendedNextStep: nextStep ? `Verify the current project state, then ${nextStep}` : undefined
  }
}

function parseJsonl(raw) {
  const events = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      events.push(JSON.parse(line))
    } catch {
      // Skip malformed transcript rows instead of making handoff generation brittle.
    }
  }
  return events
}

function isHumanPrompt(event) {
  if (event.type !== 'user') return false
  if (Array.isArray(event.message?.content)) {
    return !event.message.content.some(item => item?.type === 'tool_result')
  }
  return event.origin?.kind === 'human' || event.promptSource === 'typed'
}

function contentToText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(item => item.type !== 'tool_result')
    .map(item => item.text ?? item.content ?? '')
    .join(' ')
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectToolFiles(toolUse, keyFiles) {
  const input = toolUse.input ?? {}
  for (const filePath of filePathsFromInput(input)) {
    if (!filePath || keyFiles.has(filePath)) continue
    keyFiles.set(filePath, `${toolUse.name}: ${filePath}`)
  }
}

function filePathsFromInput(input) {
  const paths = []
  if (typeof input.file_path === 'string') paths.push(input.file_path)
  if (typeof input.path === 'string') paths.push(input.path)
  if (Array.isArray(input.files)) {
    for (const file of input.files) {
      if (typeof file === 'string') paths.push(file)
      if (typeof file?.file_path === 'string') paths.push(file.file_path)
    }
  }
  return paths
}

function summarizeToolResult(content) {
  const text = normalizeText(Array.isArray(content)
    ? content.map(item => item.text ?? item.content ?? '').join(' ')
    : content)
  return truncate(text, 180)
}

function extractGoal(summary) {
  if (!summary) return undefined
  const match = summary.match(/\bGoal:\s*(.*?)(?=\s+(?:We|Next:|Completed:|Remaining:|Risks?:)|$)/i)
  return cleanSentence(match?.[1])
}

function extractNextStep(summary) {
  if (!summary) return undefined
  const match = summary.match(/\bNext:\s*(.*?)(?=\s*\([^)]*\)\s*$|$)/i)
  return cleanSentence(match?.[1])
}

function extractObjectiveFromPrompts(prompts) {
  const objectivePrompt = [...prompts]
    .reverse()
    .find(prompt => /主要任务|目标|objective|task|完成/.test(prompt))
  return cleanSentence(objectivePrompt ?? prompts.at(-1))
}

function completedItems(summary, assistantTexts) {
  const items = []
  const summaryCompleted = extractCompletedFromSummary(summary)
  if (summaryCompleted) return [summaryCompleted]

  for (const text of assistantTexts.slice(-6)) {
    for (const sentence of splitSentences(text)) {
      if (/通过|完成|已|verified|validated|passes?|completed/i.test(sentence)) {
        items.push(truncate(cleanSentence(sentence), 220))
      }
    }
  }

  return unique(items).slice(0, maxItems)
}

function extractCompletedFromSummary(summary) {
  if (!summary) return undefined
  const match = summary.match(/\bWe\s+(.*?)(?=\s+Next:|$)/i)
  if (!match) return undefined
  return cleanSentence(capitalize(match[1]))
}

function todoItems(summary, nextStep, assistantTexts) {
  const items = []
  if (nextStep) items.push(nextStep)

  const remaining = summary?.match(/\bremaining cleanup tasks\s*\(([^)]+)\)/i)?.[1]
  if (remaining) items.push(`Remaining cleanup/tasks noted: ${remaining}`)
  if (items.length > 0) return unique(items).slice(0, maxItems)

  for (const text of assistantTexts.slice(-6)) {
    for (const sentence of splitSentences(text)) {
      if (/剩余|未完成|todo|next|下一步|继续|remaining/i.test(sentence)) {
        items.push(truncate(cleanSentence(sentence), 220))
      }
    }
  }

  return unique(items).slice(0, maxItems)
}

function decisionItems(prompts, summary) {
  const items = []
  const objective = extractObjectiveFromPrompts(prompts)
  if (objective) items.push(`User-stated task focus: ${objective}`)
  if (summary) items.push('Use the latest transcript summary as the continuation anchor, then verify against files and commands.')
  return unique(items).slice(0, maxItems)
}

function verifiedItems(summary, commands, toolCallCount) {
  const items = []
  const completed = extractCompletedFromSummary(summary)
  if (completed) items.push(completed)

  for (const command of commands) {
    if (/completed|pass|passed|success|0 failures|通过/i.test(command.result)) {
      items.push(`Command \`${command.command}\` produced: ${command.result}`)
    }
  }

  if (toolCallCount > 0) items.push(`Transcript includes ${toolCallCount} recorded tool call${toolCallCount === 1 ? '' : 's'}.`)
  return unique(items).slice(0, maxItems)
}

function riskItems(summary, prompts) {
  const items = []
  const remaining = summary?.match(/\bremaining cleanup tasks\s*\(([^)]+)\)/i)?.[1]
  if (remaining) items.push(`Open cleanup or verification area: ${remaining}`)

  if (prompts.some(prompt => /塞内容|context/i.test(prompt))) {
    items.push('Transcript includes artificial context-filling activity; continue from verified project state, not filler content.')
  }

  if (items.length === 0) {
    items.push('The generated summary may omit details that were not visible in local transcript events.')
  }

  return unique(items).slice(0, maxItems)
}

function formatCommandResult(command) {
  const prefix = command.description ? `${command.description}: ` : ''
  const suffix = command.result ? ` -> ${truncate(command.result, 180)}` : ''
  return `${prefix}\`${truncate(command.command, 160)}\`${suffix}`
}

function isUsefulCommand(command) {
  const text = `${command.description ?? ''}\n${command.command}`
  return !/fill[_ -]?context|塞内容|cat << ['"]?SCRIPT/i.test(text)
}

function splitSentences(text) {
  return normalizeText(text)
    .split(/(?<=[。.!?])\s+|\s+-\s+/)
    .map(cleanSentence)
    .filter(Boolean)
}

function cleanSentence(value) {
  const text = normalizeText(value)
  if (!text) return undefined
  return text.replace(/\.$/, '')
}

function capitalize(value) {
  const text = normalizeText(value)
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text
}

function truncate(text, limit) {
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1).trim()}…`
}

function unique(items) {
  const seen = new Set()
  const result = []
  for (const item of items.filter(Boolean)) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}
