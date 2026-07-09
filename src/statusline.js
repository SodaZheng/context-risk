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
    lastObservedAt: new Date().toISOString()
  }

  await saveSessionState(session, home)
  return session
}

function numberOrUndefined(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function createStatusLineWrapperSource() {
  const recorderModuleUrl = new URL('./statusline.js', import.meta.url).href
  return `#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const dir = join(homedir(), '.claude', 'context-risk')
const recorderModuleUrl = ${JSON.stringify(recorderModuleUrl)}
mkdirSync(dir, { recursive: true })

const input = readStdin()
try {
  await record(input)
} catch {
  // Recording must never prevent the user's original status line from rendering.
}
forward(input)

function readStdin() {
  return readFileSync(0, 'utf8')
}

async function record(raw) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return
  }
  if (!parsed.session_id) return
  const { recordStatusLineInput } = await import(recorderModuleUrl)
  await recordStatusLineInput(parsed)
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
  const result = spawnSync('sh', ['-c', original.command], {
    input: raw,
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
