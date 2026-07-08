import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getContextRiskDir } from '../src/config.js'
import { autoRepairStatusLineWrapper, installStatusLineWrapper, uninstallStatusLineWrapper } from '../src/installer.js'

let home
let settingsPath

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'context-risk-'))
  settingsPath = join(home, '.claude', 'settings.json')
  await import('node:fs/promises').then(fs => fs.mkdir(join(home, '.claude'), { recursive: true }))
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

describe('status line installer', () => {
  it('wraps an existing statusLine and preserves non-command fields', async () => {
    await writeFile(settingsPath, JSON.stringify({
      statusLine: {
        type: 'command',
        command: '~/.claude/statusline.sh',
        padding: 2,
        refreshInterval: 5
      },
      theme: 'dark-ansi'
    }, null, 2))

    await installStatusLineWrapper(settingsPath, home)

    const settings = JSON.parse(await readFile(settingsPath, 'utf8'))
    expect(settings.theme).toBe('dark-ansi')
    expect(settings.statusLine.type).toBe('command')
    expect(settings.statusLine.padding).toBe(2)
    expect(settings.statusLine.refreshInterval).toBe(5)
    expect(settings.statusLine.command).toContain('statusline-wrapper.mjs')

    const original = JSON.parse(await readFile(join(getContextRiskDir(home), 'original-statusline.json'), 'utf8'))
    expect(original.command).toBe('~/.claude/statusline.sh')
  })

  it('creates a wrapper when no statusLine exists', async () => {
    await writeFile(settingsPath, JSON.stringify({ theme: 'dark-ansi' }, null, 2))
    await installStatusLineWrapper(settingsPath, home)
    const settings = JSON.parse(await readFile(settingsPath, 'utf8'))
    expect(settings.statusLine.command).toContain('statusline-wrapper.mjs')
  })

  it('restores the original statusLine on uninstall', async () => {
    await writeFile(settingsPath, JSON.stringify({
      statusLine: { type: 'command', command: '~/.claude/statusline.sh', padding: 2 }
    }, null, 2))
    await installStatusLineWrapper(settingsPath, home)
    await uninstallStatusLineWrapper(settingsPath, home)
    const settings = JSON.parse(await readFile(settingsPath, 'utf8'))
    expect(settings.statusLine).toEqual({ type: 'command', command: '~/.claude/statusline.sh', padding: 2 })
  })

  it('does not double-wrap or overwrite the saved original statusLine', async () => {
    await writeFile(settingsPath, JSON.stringify({
      statusLine: { type: 'command', command: '~/.claude/statusline.sh', padding: 2 }
    }, null, 2))
    await installStatusLineWrapper(settingsPath, home)
    await installStatusLineWrapper(settingsPath, home)
    const original = JSON.parse(await readFile(join(getContextRiskDir(home), 'original-statusline.json'), 'utf8'))
    const settings = JSON.parse(await readFile(settingsPath, 'utf8'))
    expect(original.command).toBe('~/.claude/statusline.sh')
    expect(settings.statusLine.command.match(/statusline-wrapper\.mjs/g)).toHaveLength(1)
  })

  it('does not rewrite settings or add backups when already installed', async () => {
    await writeFile(settingsPath, JSON.stringify({
      statusLine: { type: 'command', command: '~/.claude/statusline.sh', padding: 2 }
    }, null, 2))
    await installStatusLineWrapper(settingsPath, home)

    const beforeSettings = await readFile(settingsPath, 'utf8')
    const beforeBackups = await backupFiles()
    await new Promise(resolve => setTimeout(resolve, 5))

    await installStatusLineWrapper(settingsPath, home)

    expect(await readFile(settingsPath, 'utf8')).toBe(beforeSettings)
    expect(await backupFiles()).toEqual(beforeBackups)
  })

  it('preserves an unrelated statusLine command that mentions the wrapper filename', async () => {
    await writeFile(settingsPath, JSON.stringify({
      statusLine: {
        type: 'command',
        command: 'printf statusline-wrapper.mjs',
        padding: 2
      }
    }, null, 2))

    await installStatusLineWrapper(settingsPath, home)

    const original = JSON.parse(await readFile(join(getContextRiskDir(home), 'original-statusline.json'), 'utf8'))
    expect(original).toEqual({
      type: 'command',
      command: 'printf statusline-wrapper.mjs',
      padding: 2
    })
  })

  it('auto repair skips when ContextRisk is not installed', async () => {
    await writeFile(settingsPath, JSON.stringify({ theme: 'dark-ansi' }, null, 2))

    const repaired = await autoRepairStatusLineWrapper(settingsPath, home)

    const settings = JSON.parse(await readFile(settingsPath, 'utf8'))
    expect(repaired).toBe(false)
    expect(settings.statusLine).toBeUndefined()
  })

  it('auto repair skips unrelated commands that mention the wrapper filename', async () => {
    await writeFile(settingsPath, JSON.stringify({
      statusLine: { type: 'command', command: 'printf statusline-wrapper.mjs', padding: 2 }
    }, null, 2))

    const repaired = await autoRepairStatusLineWrapper(settingsPath, home)

    const settings = JSON.parse(await readFile(settingsPath, 'utf8'))
    expect(repaired).toBe(false)
    expect(settings.statusLine).toEqual({
      type: 'command',
      command: 'printf statusline-wrapper.mjs',
      padding: 2
    })
  })

  it('auto repair refreshes an installed wrapper without overwriting the saved original', async () => {
    const dir = getContextRiskDir(home)
    const wrapperPath = join(dir, 'statusline-wrapper.mjs')
    const originalPath = join(dir, 'original-statusline.json')
    await mkdir(dir, { recursive: true })
    await writeFile(wrapperPath, 'old wrapper source', 'utf8')
    await writeFile(originalPath, JSON.stringify({ type: 'command', command: 'printf original', padding: 1 }, null, 2))
    await writeFile(settingsPath, JSON.stringify({
      statusLine: { type: 'command', command: `node "${wrapperPath}"`, padding: 2 }
    }, null, 2))

    const repaired = await autoRepairStatusLineWrapper(settingsPath, home)

    const wrapper = await readFile(wrapperPath, 'utf8')
    const original = JSON.parse(await readFile(originalPath, 'utf8'))
    const settings = JSON.parse(await readFile(settingsPath, 'utf8'))
    expect(repaired).toBe(true)
    expect(wrapper).toContain('Recording must never prevent')
    expect(original).toEqual({ type: 'command', command: 'printf original', padding: 1 })
    expect(settings.statusLine.command).toBe(`node "${wrapperPath}"`)
    expect(settings.statusLine.padding).toBe(2)
  })
})

async function backupFiles() {
  return (await readdir(join(home, '.claude')))
    .filter(name => name.startsWith('settings.json.context-risk-') && name.endsWith('.bak'))
    .sort()
}
