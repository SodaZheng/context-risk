import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../src/config.js'
import {
  assessPostToolBatchRisk,
  assessPreToolRisk,
  bandForPercentage,
  isRiskManagementPrompt,
  measureToolBatchChars,
  shouldAllowPromptOverride
} from '../src/risk.js'

describe('risk engine', () => {
  it('maps percentages to risk bands', () => {
    expect(bandForPercentage(undefined, defaultConfig)).toBe('none')
    expect(bandForPercentage(39.9, defaultConfig)).toBe('none')
    expect(bandForPercentage(40, defaultConfig)).toBe('notice')
    expect(bandForPercentage(50, defaultConfig)).toBe('softBlock')
    expect(bandForPercentage(65, defaultConfig)).toBe('handoffRecommended')
    expect(bandForPercentage(80, defaultConfig)).toBe('highRisk')
  })

  it('detects explicit continue overrides', () => {
    expect(shouldAllowPromptOverride('context-risk:continue finish the current step')).toBe(true)
    expect(shouldAllowPromptOverride('finish the current step')).toBe(false)
  })

  it('allows risk management prompts', () => {
    expect(isRiskManagementPrompt('/context-risk:handoff')).toBe(true)
    expect(isRiskManagementPrompt('/context-risk:compact-plan')).toBe(true)
    expect(isRiskManagementPrompt('/compact Preserve current task')).toBe(true)
    expect(isRiskManagementPrompt('please continue')).toBe(false)
  })

  it('measures post tool batch output characters', () => {
    expect(measureToolBatchChars({
      hook_event_name: 'PostToolBatch',
      tool_calls: [
        { tool_name: 'Read', tool_response: 'abc' },
        { tool_name: 'Read', tool_response: ['de', 'fg'] }
      ]
    })).toBeGreaterThanOrEqual(7)
  })

  it('blocks unbounded broad bash commands', () => {
    const result = assessPreToolRisk({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'find / -type f' }
    }, defaultConfig)

    expect(result.block).toBe(true)
    expect(result.reason).toContain('find')
  })

  it('blocks large tool batches', () => {
    const result = assessPostToolBatchRisk({
      hook_event_name: 'PostToolBatch',
      tool_calls: [{ tool_name: 'Bash', tool_response: 'x'.repeat(51000) }]
    }, defaultConfig)

    expect(result.block).toBe(true)
    expect(result.totalChars).toBe(51000)
  })
})
