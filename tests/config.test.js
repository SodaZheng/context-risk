import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../src/config.js'

describe('defaultConfig', () => {
  it('uses the agreed context risk thresholds', () => {
    expect(defaultConfig.thresholds).toEqual({
      notice: 40,
      softBlock: 50,
      handoffRecommended: 65,
      highRisk: 80
    })
  })
})
