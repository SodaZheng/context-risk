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

    const { stdout } = await execFileAsync('node', [
      'src/cli.js',
      'handoff',
      'draft',
      '--cwd',
      project,
      '--objective',
      'E2E ContextRisk'
    ], {
      env: { ...process.env, HOME: home }
    })

    expect(stdout.trim()).toContain('.context-risk/handoffs/')
    const handoff = await readFile(stdout.trim(), 'utf8')
    expect(handoff).toContain('E2E ContextRisk')
  })
})
