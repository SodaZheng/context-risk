import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getContextRiskDir } from '../src/config.js'
import { loadState } from '../src/state.js'
import { createStatusLineWrapperSource, recordStatusLineInput } from '../src/statusline.js'

let home

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'context-risk-'))
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

describe('status line recorder', () => {
  it('records session metrics from status line input', async () => {
    await recordStatusLineInput({
      session_id: 's1',
      prompt_id: 'p1',
      transcript_path: '/tmp/transcript.jsonl',
      cwd: '/repo',
      model: { id: 'claude-opus-4-1', display_name: 'Opus' },
      context_window: {
        used_percentage: 41.8,
        context_window_size: 200000,
        total_input_tokens: 80000,
        total_output_tokens: 3600
      }
    }, home)

    const state = await loadState(home)
    expect(state.sessions.s1.lastObservedUsedPercentage).toBe(41.8)
    expect(state.sessions.s1.lastObservedContextWindowSize).toBe(200000)
    expect(state.sessions.s1.modelDisplayName).toBe('Opus')
    expect(state.sessions.s1.thresholdEvents).toBeUndefined()
    expect(state.sessions.s1.checkpointEvents).toBeUndefined()
  })

  it('returns undefined when session id is missing', async () => {
    const result = await recordStatusLineInput({ cwd: '/repo' }, home)
    expect(result).toBeUndefined()
  })

  it('emits a wrapper source that references original-statusline.json', async () => {
    const source = createStatusLineWrapperSource()
    expect(source).toContain('original-statusline.json')
    expect(source).toContain('state.json')
    expect(source).toContain('spawnSync')
    await readFile(join(getContextRiskDir(home), 'missing')).catch(error => {
      expect(error.code).toBe('ENOENT')
    })
  })

  it('still forwards to the original status line when state recording fails', async () => {
    const dir = getContextRiskDir(home)
    const wrapperPath = join(dir, 'statusline-wrapper.mjs')
    await mkdir(dir, { recursive: true })
    await writeFile(wrapperPath, createStatusLineWrapperSource(), 'utf8')
    await writeFile(join(dir, 'original-statusline.json'), JSON.stringify({
      type: 'command',
      command: 'printf original-ok'
    }), 'utf8')
    await writeFile(join(dir, 'state.json'), '{not-json', 'utf8')

    const input = JSON.stringify({
      session_id: 's1',
      context_window: { used_percentage: 42 }
    })
    const result = await runNodeWithInput(wrapperPath, input, home)

    expect(result.code).toBe(0)
    expect(result.stdout).toBe('original-ok')
  })
})

function runNodeWithInput(file, input, home) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [file], {
      env: { ...process.env, HOME: home },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', code => {
      resolve({ code, stdout, stderr })
    })
    child.stdin.end(input)
  })
}
