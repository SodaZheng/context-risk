import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { maybeCreateAutoHandoff } from '../src/auto-handoff.js'
import { loadState, saveSessionState } from '../src/state.js'

let home
let cwd

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'context-risk-home-'))
  cwd = await mkdtemp(join(tmpdir(), 'context-risk-project-'))
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
  await rm(cwd, { recursive: true, force: true })
})

async function saveObservedSession(percentage, extra = {}) {
  await saveSessionState({
    sessionId: 's1',
    transcriptPath: '/tmp/transcript.jsonl',
    cwd,
    lastObservedUsedPercentage: percentage,
    lastObservedAt: '2026-07-08T00:00:00.000Z',
    ...extra
  }, home)
}

describe('auto handoff threshold engine', () => {
  it('creates a 40 percent handoff with a switch suggestion', async () => {
    await saveObservedSession(40)

    const output = await maybeCreateAutoHandoff({
      hook_event_name: 'UserPromptSubmit',
      session_id: 's1'
    }, home)

    expect(output?.decision).toBeUndefined()
    expect(output?.hookSpecificOutput?.hookEventName).toBe('UserPromptSubmit')
    expect(output?.hookSpecificOutput?.additionalContext).toContain('40%')
    expect(output?.hookSpecificOutput?.additionalContext).toContain('/new')
    expect(output?.hookSpecificOutput?.additionalContext).toContain('/context-risk:continue')

    const handoffFiles = await readdir(join(cwd, '.context-risk', 'handoffs'))
    expect(handoffFiles).toHaveLength(1)

    const state = await loadState(home)
    expect(state.sessions.s1.autoHandoffEvents['40'].handoffId).toBeTruthy()
  })

  it('creates a new 50 percent handoff after 40 percent was handled', async () => {
    await saveObservedSession(40)
    await maybeCreateAutoHandoff({ hook_event_name: 'UserPromptSubmit', session_id: 's1' }, home)

    await saveObservedSession(50)
    const output = await maybeCreateAutoHandoff({
      hook_event_name: 'PreToolUse',
      session_id: 's1',
      cwd
    }, home)

    expect(output?.hookSpecificOutput?.additionalContext).toContain('50%')
    expect(output?.hookSpecificOutput?.additionalContext).toContain('switch soon')

    const handoffFiles = await readdir(join(cwd, '.context-risk', 'handoffs'))
    expect(handoffFiles).toHaveLength(2)
  })

  it('uses stronger language at 60 percent and above', async () => {
    await saveObservedSession(60)

    const output = await maybeCreateAutoHandoff({
      hook_event_name: 'PostToolBatch',
      session_id: 's1',
      cwd
    }, home)

    expect(output?.hookSpecificOutput?.additionalContext).toContain('60%')
    expect(output?.hookSpecificOutput?.additionalContext).toContain('strongly recommended')
  })

  it('marks lower crossed thresholds handled when usage jumps to 67 percent', async () => {
    await saveObservedSession(67)

    const output = await maybeCreateAutoHandoff({
      hook_event_name: 'SubagentStop',
      session_id: 's1',
      cwd
    }, home)

    expect(output?.hookSpecificOutput?.additionalContext).toContain('60%')

    const state = await loadState(home)
    expect(Object.keys(state.sessions.s1.autoHandoffEvents).sort()).toEqual(['40', '50', '60'])

    const handoffFiles = await readdir(join(cwd, '.context-risk', 'handoffs'))
    expect(handoffFiles).toHaveLength(1)
  })

  it('does not create duplicate handoffs for the same handled threshold', async () => {
    await saveObservedSession(40)
    await maybeCreateAutoHandoff({ hook_event_name: 'UserPromptSubmit', session_id: 's1', cwd }, home)

    const output = await maybeCreateAutoHandoff({
      hook_event_name: 'PreToolUse',
      session_id: 's1',
      cwd
    }, home)

    expect(output).toBeUndefined()

    const handoffFiles = await readdir(join(cwd, '.context-risk', 'handoffs'))
    expect(handoffFiles).toHaveLength(1)
  })

  it('creates only one handoff when hooks race for the same threshold', async () => {
    await saveObservedSession(40)

    const outputs = await Promise.all(Array.from({ length: 5 }, () => maybeCreateAutoHandoff({
      hook_event_name: 'PostToolBatch',
      session_id: 's1',
      cwd
    }, home)))

    expect(outputs.filter(Boolean)).toHaveLength(1)

    const handoffFiles = await readdir(join(cwd, '.context-risk', 'handoffs'))
    expect(handoffFiles).toHaveLength(1)

    const state = await loadState(home)
    expect(Object.keys(state.sessions.s1.autoHandoffEvents)).toEqual(['40'])
  })

  it('prefers the recorded session cwd over a hook process cwd', async () => {
    const hookCwd = await mkdtemp(join(tmpdir(), 'context-risk-hook-cwd-'))
    try {
      await saveObservedSession(40)

      await maybeCreateAutoHandoff({
        hook_event_name: 'Stop',
        session_id: 's1',
        cwd: hookCwd
      }, home)

      const projectHandoffs = await readdir(join(cwd, '.context-risk', 'handoffs'))
      expect(projectHandoffs).toHaveLength(1)
      await readdir(join(hookCwd, '.context-risk', 'handoffs')).then(
        () => {
          throw new Error('hook cwd should not receive handoffs')
        },
        error => {
          expect(error.code).toBe('ENOENT')
        }
      )
    } finally {
      await rm(hookCwd, { recursive: true, force: true })
    }
  })

  it('returns no output when observed context usage is missing', async () => {
    await saveObservedSession(undefined)

    const output = await maybeCreateAutoHandoff({
      hook_event_name: 'Stop',
      session_id: 's1',
      cwd
    }, home)

    expect(output).toBeUndefined()
  })

  it('writes threshold metadata into the generated handoff file', async () => {
    await saveObservedSession(80)

    const output = await maybeCreateAutoHandoff({
      hook_event_name: 'PostCompact',
      session_id: 's1',
      cwd
    }, home)

    const match = String(output?.hookSpecificOutput?.additionalContext).match(/continue ([^\s]+)/)
    expect(match?.[1]).toBeTruthy()

    const handoffFiles = await readdir(join(cwd, '.context-risk', 'handoffs'))
    const content = await readFile(join(cwd, '.context-risk', 'handoffs', handoffFiles[0]), 'utf8')
    expect(content).toContain('Auto handoff threshold: 80%')
    expect(content).toContain('Continue work from ContextRisk auto handoff at 80% context usage')
  })

  it('populates auto handoff sections from the current transcript', async () => {
    const transcriptPath = join(home, 'session.jsonl')
    await writeFile(transcriptPath, [
      jsonl({
        type: 'user',
        origin: { kind: 'human' },
        message: { role: 'user', content: '我告诉你你的主要任务是帮我完成这一整个项目的搭建' },
        timestamp: '2026-07-08T15:26:49.933Z'
      }),
      jsonl({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: '好的，让我先全面了解这个项目的定位和当前状态。' },
            {
              type: 'tool_use',
              id: 'read-main',
              name: 'Read',
              input: { file_path: '/project/src/cli/main.mjs' }
            }
          ]
        },
        timestamp: '2026-07-08T15:26:53.378Z'
      }),
      jsonl({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'smoke',
              name: 'Bash',
              input: {
                command: 'npm run smoke 2>&1',
                description: 'Run smoke test to verify current state'
              }
            }
          ]
        },
        timestamp: '2026-07-08T15:27:25.578Z'
      }),
      jsonl({
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'smoke',
              content: '> ccflow@0.1.0 smoke\nrunId: run_1\nstatus: completed'
            }
          ]
        },
        timestamp: '2026-07-08T15:27:25.965Z'
      }),
      jsonl({
        type: 'system',
        subtype: 'away_summary',
        content: 'Goal: finish building the ccflow project. We verified all core code works via smoke test and listed remaining cleanup tasks (untracked files, .gitignore, example config, resume/MCP testing). Next: clean repo cruft and verify the resume and MCP features.',
        timestamp: '2026-07-08T15:32:30.173Z'
      })
    ].join('\n') + '\n', 'utf8')

    await saveObservedSession(40, { transcriptPath })

    await maybeCreateAutoHandoff({
      hook_event_name: 'Stop',
      session_id: 's1',
      cwd
    }, home)

    const handoffFiles = await readdir(join(cwd, '.context-risk', 'handoffs'))
    const content = await readFile(join(cwd, '.context-risk', 'handoffs', handoffFiles[0]), 'utf8')

    expect(content).not.toContain('Capture completed work here')
    expect(content).toContain('finish building the ccflow project')
    expect(content).toContain('Verified all core code works via smoke test')
    expect(content).toContain('clean repo cruft and verify the resume and MCP features')
    expect(content).toContain('/project/src/cli/main.mjs')
    expect(content).toContain('npm run smoke 2>&1')
    expect(content).toContain('status: completed')
  })
})

function jsonl(value) {
  return JSON.stringify(value)
}
