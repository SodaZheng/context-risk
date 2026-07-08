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
  it('injects guardrails once at notice threshold', async () => {
    await saveSessionState({
      sessionId: 's1',
      lastObservedUsedPercentage: 42,
      lastObservedAt: '2026-07-07T00:00:00.000Z',
      thresholdEvents: {},
      checkpointEvents: {}
    }, home)

    const output = await handleHook({
      hook_event_name: 'UserPromptSubmit',
      session_id: 's1',
      prompt: 'continue'
    }, home)

    expect(output?.hookSpecificOutput?.hookEventName).toBe('UserPromptSubmit')
    expect(String(output?.hookSpecificOutput?.additionalContext)).toContain('ContextRisk')
    expect(String(output?.hookSpecificOutput?.additionalContext)).toContain('last observed')

    const second = await handleHook({
      hook_event_name: 'UserPromptSubmit',
      session_id: 's1',
      prompt: 'continue'
    }, home)

    expect(second).toBeUndefined()
  })

  it('blocks normal prompts at soft block threshold', async () => {
    await saveSessionState({
      sessionId: 's1',
      lastObservedUsedPercentage: 51,
      lastObservedAt: '2026-07-07T00:00:00.000Z',
      thresholdEvents: {},
      checkpointEvents: {}
    }, home)

    const output = await handleHook({
      hook_event_name: 'UserPromptSubmit',
      session_id: 's1',
      prompt: 'continue'
    }, home)

    expect(output?.decision).toBe('block')
    expect(output?.reason).toContain('/context-risk:handoff')
    expect(output?.reason).toContain('last observed')
  })

  it('allows explicit override at soft block threshold', async () => {
    await saveSessionState({
      sessionId: 's1',
      lastObservedUsedPercentage: 51,
      lastObservedAt: '2026-07-07T00:00:00.000Z',
      thresholdEvents: {},
      checkpointEvents: {}
    }, home)

    const output = await handleHook({
      hook_event_name: 'UserPromptSubmit',
      session_id: 's1',
      prompt: 'context-risk:continue finish the edit'
    }, home)

    expect(output).toBeUndefined()
  })

  it('blocks risky pre tool use', async () => {
    const output = await handleHook({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'cat huge.log' }
    }, home)

    expect(output?.hookSpecificOutput?.permissionDecision).toBe('deny')
  })

  it('blocks large post tool batches', async () => {
    const output = await handleHook({
      hook_event_name: 'PostToolBatch',
      tool_calls: [{ tool_name: 'Bash', tool_response: 'x'.repeat(51000) }]
    }, home)

    expect(output?.decision).toBe('block')
    expect(output?.reason).toContain('tool batch')
  })
})
