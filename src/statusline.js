import { saveSessionState } from './state.js'

export async function recordStatusLineInput(input, home) {
  if (!input.session_id) return undefined

  const session = {
    sessionId: input.session_id,
    promptId: input.prompt_id,
    transcriptPath: input.transcript_path,
    cwd: input.workspace?.current_dir ?? input.cwd,
    modelId: input.model?.id,
    modelDisplayName: input.model?.display_name,
    lastObservedUsedPercentage: numberOrUndefined(input.context_window?.used_percentage),
    lastObservedContextWindowSize: numberOrUndefined(input.context_window?.context_window_size),
    lastObservedTotalInputTokens: numberOrUndefined(input.context_window?.total_input_tokens),
    lastObservedTotalOutputTokens: numberOrUndefined(input.context_window?.total_output_tokens),
    lastObservedAt: new Date().toISOString(),
    thresholdEvents: {},
    checkpointEvents: {}
  }

  await saveSessionState(session, home)
  return session
}

function numberOrUndefined(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function createStatusLineWrapperSource() {
  return `#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const dir = join(homedir(), '.claude', 'context-risk')
mkdirSync(dir, { recursive: true })

const input = readStdin()
try {
  record(input)
} catch {
  // Recording must never prevent the user's original status line from rendering.
}
forward(input)

function readStdin() {
  return readFileSync(0, 'utf8')
}

function record(raw) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return
  }
  if (!parsed.session_id) return

  const statePath = join(dir, 'state.json')
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { version: 1, sessions: {} }
  state.latestSessionId = parsed.session_id
  state.sessions[parsed.session_id] = {
    ...(state.sessions[parsed.session_id] || {}),
    sessionId: parsed.session_id,
    promptId: parsed.prompt_id,
    transcriptPath: parsed.transcript_path,
    cwd: parsed.workspace?.current_dir || parsed.cwd,
    modelId: parsed.model?.id,
    modelDisplayName: parsed.model?.display_name,
    lastObservedUsedPercentage: typeof parsed.context_window?.used_percentage === 'number' ? parsed.context_window.used_percentage : undefined,
    lastObservedContextWindowSize: typeof parsed.context_window?.context_window_size === 'number' ? parsed.context_window.context_window_size : undefined,
    lastObservedTotalInputTokens: typeof parsed.context_window?.total_input_tokens === 'number' ? parsed.context_window.total_input_tokens : undefined,
    lastObservedTotalOutputTokens: typeof parsed.context_window?.total_output_tokens === 'number' ? parsed.context_window.total_output_tokens : undefined,
    lastObservedAt: new Date().toISOString(),
    thresholdEvents: state.sessions[parsed.session_id]?.thresholdEvents || {},
    checkpointEvents: state.sessions[parsed.session_id]?.checkpointEvents || {}
  }
  const tmpPath = statePath + '.' + process.pid + '.tmp'
  writeFileSync(tmpPath, JSON.stringify(state, null, 2) + '\\n')
  renameSync(tmpPath, statePath)
}

function forward(raw) {
  const originalPath = join(dir, 'original-statusline.json')
  if (!existsSync(originalPath)) {
    printMinimal(raw)
    return
  }
  const original = JSON.parse(readFileSync(originalPath, 'utf8'))
  if (!original.command) {
    printMinimal(raw)
    return
  }
  const result = spawnSync(original.command, {
    input: raw,
    shell: true,
    encoding: 'utf8',
    env: process.env
  })
  if (result.stdout) process.stdout.write(result.stdout)
}

function printMinimal(raw) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return
  }
  const used = parsed.context_window?.used_percentage
  if (typeof used === 'number') process.stdout.write('ContextRisk ' + Math.round(used) + '%\\n')
}
`
}
