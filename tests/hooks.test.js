import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { handleHook } from '../src/hooks.js'
import { saveSessionState } from '../src/state.js'

let home

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'context-risk-'))
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

describe('hook handlers', () => {
  it('creates an auto handoff at 40 percent without blocking the prompt', async () => {
    await saveSessionState({
      sessionId: 's1',
      cwd: home,
      transcriptPath: '/tmp/transcript.jsonl',
      lastObservedUsedPercentage: 42,
      lastObservedAt: '2026-07-08T00:00:00.000Z'
    }, home)

    const output = await handleHook({
      hook_event_name: 'UserPromptSubmit',
      session_id: 's1',
      prompt: 'continue'
    }, home)

    expect(output?.decision).toBeUndefined()
    expect(output?.hookSpecificOutput?.permissionDecision).toBeUndefined()
    expect(output?.hookSpecificOutput?.hookEventName).toBe('UserPromptSubmit')
    expect(output?.hookSpecificOutput?.additionalContext).toContain('auto handoff created')
    expect(output?.hookSpecificOutput?.additionalContext).toContain('/new')
    expect(output?.hookSpecificOutput?.additionalContext).toContain('/context-risk:continue')
  })

  it('does not create duplicate handoffs for repeated hook calls in the same band', async () => {
    await saveSessionState({
      sessionId: 's1',
      cwd: home,
      transcriptPath: '/tmp/transcript.jsonl',
      lastObservedUsedPercentage: 42,
      lastObservedAt: '2026-07-08T00:00:00.000Z'
    }, home)

    await handleHook({
      hook_event_name: 'UserPromptSubmit',
      session_id: 's1',
      prompt: 'continue'
    }, home)

    const second = await handleHook({
      hook_event_name: 'PreToolUse',
      sessionId: 's1',
      session_id: 's1',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' }
    }, home)

    expect(second).toBeUndefined()
  })

  it('observes tool hooks without warning about specific commands', async () => {
    await saveSessionState({
      sessionId: 's1',
      cwd: home,
      transcriptPath: '/tmp/transcript.jsonl',
      lastObservedUsedPercentage: 35,
      lastObservedAt: '2026-07-08T00:00:00.000Z'
    }, home)

    const output = await handleHook({
      hook_event_name: 'PreToolUse',
      session_id: 's1',
      tool_name: 'Bash',
      tool_input: { command: 'cat huge.log' }
    }, home)

    expect(output).toBeUndefined()
  })

  it('creates handoffs from non-prompt observation hooks', async () => {
    await saveSessionState({
      sessionId: 's1',
      cwd: home,
      transcriptPath: '/tmp/transcript.jsonl',
      lastObservedUsedPercentage: 70,
      lastObservedAt: '2026-07-08T00:00:00.000Z'
    }, home)

    const output = await handleHook({
      hook_event_name: 'SubagentStop',
      session_id: 's1',
      agent_type: 'reviewer',
      last_assistant_message: 'short result'
    }, home)

    expect(output?.hookSpecificOutput?.hookEventName).toBe('SubagentStop')
    expect(output?.hookSpecificOutput?.additionalContext).toContain('70%')
    expect(output?.hookSpecificOutput?.additionalContext).toContain('strongly recommended')
  })
})
