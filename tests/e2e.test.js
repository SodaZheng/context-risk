import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

let home
let project

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'context-risk-home-'))
  project = await mkdtemp(join(tmpdir(), 'context-risk-project-'))
  await mkdir(join(home, '.claude'), { recursive: true })
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
  await rm(project, { recursive: true, force: true })
})

describe('cli e2e', () => {
  it('installs wrapper and creates handoff draft through the source cli', async () => {
    const settingsPath = join(home, '.claude', 'settings.json')
    await writeFile(settingsPath, JSON.stringify({
      statusLine: { type: 'command', command: 'printf original', padding: 1 }
    }, null, 2))

    await execFileAsync('node', ['src/cli.js', 'install', '--settings', settingsPath], {
      env: { ...process.env, HOME: home }
    })

    const settings = JSON.parse(await readFile(settingsPath, 'utf8'))
    expect(settings.statusLine.command).toContain('statusline-wrapper.mjs')
    expect(settings.statusLine.padding).toBe(1)

    const transcriptPath = join(home, 'current-session.jsonl')
    await writeFile(transcriptPath, `${JSON.stringify({
      type: 'user',
      origin: { kind: 'human' },
      message: {
        role: 'user',
        content: 'The current objective is to ship the no-argument handoff command.'
      }
    })}\n`)

    const stateDir = join(home, '.claude', 'context-risk')
    await mkdir(stateDir, { recursive: true })
    await writeFile(join(stateDir, 'state.json'), JSON.stringify({
      version: 1,
      latestSessionId: 'current-session',
      sessions: {
        'current-session': {
          sessionId: 'current-session',
          transcriptPath,
          cwd: project,
          lastObservedAt: '2026-07-25T00:00:00.000Z'
        }
      }
    }))

    const { stdout } = await execFileAsync('node', [
      'src/cli.js',
      'handoff',
      'draft',
      '--cwd',
      project
    ], {
      env: { ...process.env, HOME: home }
    })

    expect(stdout.trim()).toContain('.context-risk/handoffs/')
    const handoff = await readFile(stdout.trim(), 'utf8')
    expect(handoff).toContain('ship the no-argument handoff command')
    expect(handoff).toContain('current-session')
    expect(handoff).toContain(transcriptPath)
  })
})
