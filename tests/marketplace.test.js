import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('Claude Code marketplace packaging', () => {
  it('publishes the context-risk plugin from the repository marketplace', async () => {
    const marketplace = JSON.parse(await readFile(join(root, '.claude-plugin', 'marketplace.json'), 'utf8'))
    expect(marketplace.name).toBe('context-risk-marketplace')
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({
        name: 'context-risk',
        source: './'
      })
    ])
  })

  it('uses source runtime commands instead of dist artifacts', async () => {
    const files = [
      'hooks/hooks.json',
      'skills/handoff/SKILL.md',
      'skills/install/SKILL.md',
      'skills/repair/SKILL.md',
      'skills/uninstall/SKILL.md',
      'package.json'
    ]
    const contents = await Promise.all(files.map(file => readFile(join(root, file), 'utf8')))
    const combined = contents.join('\n')
    expect(combined).not.toContain('dist/src/cli.js')
    expect(combined).toContain('src/cli.js')
  })

  it('does not duplicate the standard hooks config in the plugin manifest', async () => {
    const manifest = JSON.parse(await readFile(join(root, '.claude-plugin', 'plugin.json'), 'utf8'))
    const declaredHooks = [manifest.hooks].flat().filter(Boolean)

    expect(declaredHooks).not.toContain('./hooks/hooks.json')
    expect(declaredHooks).not.toContain('hooks/hooks.json')
  })

  it('auto repairs the status line wrapper at session start', async () => {
    const hooks = JSON.parse(await readFile(join(root, 'hooks/hooks.json'), 'utf8'))
    expect(hooks.hooks.SessionStart[0].hooks[0]).toEqual(expect.objectContaining({
      type: 'command',
      command: 'node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" auto-repair'
    }))
  })

  it('exposes status line installer skills for marketplace installs', async () => {
    const skills = {
      install: await readFile(join(root, 'skills/install/SKILL.md'), 'utf8'),
      repair: await readFile(join(root, 'skills/repair/SKILL.md'), 'utf8'),
      uninstall: await readFile(join(root, 'skills/uninstall/SKILL.md'), 'utf8')
    }

    expect(skills.install).toContain('node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" install')
    expect(skills.repair).toContain('node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" repair')
    expect(skills.uninstall).toContain('node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" uninstall')
  })
})
