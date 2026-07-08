import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../src/config.js'

describe('defaultConfig', () => {
  it('uses minimal auto handoff defaults without legacy guardrail config', () => {
    expect(defaultConfig.autoHandoff).toEqual({
      enabled: true,
      thresholds: [40, 50, 60, 70, 80, 90]
    })
    expect(defaultConfig.thresholds).toBeUndefined()
    expect(defaultConfig.maxToolBatchCharsBeforeBlock).toBeUndefined()
    expect(defaultConfig.maxSingleToolCharsBeforeWarning).toBeUndefined()
    expect(defaultConfig.checkpointOncePerThreshold).toBeUndefined()
  })
})
