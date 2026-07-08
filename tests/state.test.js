import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendEvent } from '../src/events.js'
import { getContextRiskDir, loadConfig } from '../src/config.js'
import { loadState, saveSessionState } from '../src/state.js'

let home

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'context-risk-'))
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

describe('config and state', () => {
  it('resolves the local context-risk directory', () => {
    expect(getContextRiskDir(home)).toBe(join(home, '.claude', 'context-risk'))
  })

  it('loads default config when no local config exists', async () => {
    const config = await loadConfig(home)
    expect(config.thresholds.softBlock).toBe(50)
    expect(config.maxToolBatchCharsBeforeBlock).toBe(50000)
  })

  it('merges local config overrides', async () => {
    const dir = getContextRiskDir(home)
    await writeFile(join(dir, 'config.json'), JSON.stringify({ thresholds: { softBlock: 55 } }), {
      flag: 'wx'
    }).catch(async error => {
      if (error.code !== 'ENOENT') throw error
      await import('node:fs/promises').then(fs => fs.mkdir(dir, { recursive: true }))
      await writeFile(join(dir, 'config.json'), JSON.stringify({ thresholds: { softBlock: 55 } }))
    })

    const config = await loadConfig(home)
    expect(config.thresholds).toEqual({
      notice: 40,
      softBlock: 55,
      handoffRecommended: 65,
      highRisk: 80
    })
  })

  it('creates and updates session state', async () => {
    await saveSessionState({
      sessionId: 's1',
      lastObservedUsedPercentage: 44,
      lastObservedAt: '2026-07-07T00:00:00.000Z',
      thresholdEvents: {},
      checkpointEvents: {}
    }, home)

    const state = await loadState(home)
    expect(state.latestSessionId).toBe('s1')
    expect(state.sessions.s1.lastObservedUsedPercentage).toBe(44)
  })

  it('appends jsonl events', async () => {
    await appendEvent({ type: 'threshold', sessionId: 's1', band: 'notice' }, home)
    const content = await readFile(join(getContextRiskDir(home), 'events.jsonl'), 'utf8')
    expect(content.trim()).toBe('{"type":"threshold","sessionId":"s1","band":"notice"}')
  })
})
