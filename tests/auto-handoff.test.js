import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
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
})
