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
    expect(config.autoHandoff).toEqual({
      enabled: true,
      thresholds: [40, 50, 60, 70, 80, 90]
    })
    expect(config.thresholds).toBeUndefined()
  })

  it('merges local config overrides', async () => {
    const dir = getContextRiskDir(home)
    await writeFile(join(dir, 'config.json'), JSON.stringify({
      autoHandoff: { enabled: false, thresholds: [45, 55, 65] }
    }), {
      flag: 'wx'
    }).catch(async error => {
      if (error.code !== 'ENOENT') throw error
      await import('node:fs/promises').then(fs => fs.mkdir(dir, { recursive: true }))
      await writeFile(join(dir, 'config.json'), JSON.stringify({
        autoHandoff: { enabled: false, thresholds: [45, 55, 65] }
      }))
    })

    const config = await loadConfig(home)
    expect(config.autoHandoff).toEqual({
      enabled: false,
      thresholds: [45, 55, 65]
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
    expect(state.sessions.s1.thresholdEvents).toEqual({})
    expect(state.sessions.s1.checkpointEvents).toEqual({})
  })

  it('does not lose auto handoff events when session saves race', async () => {
    await Promise.all([40, 50, 60].map(threshold => saveSessionState({
      sessionId: 's1',
      autoHandoffEvents: {
        [String(threshold)]: {
          threshold,
          handoffId: `handoff-${threshold}`,
          handoffPath: `/tmp/handoff-${threshold}.md`
        }
      }
    }, home)))

    const state = await loadState(home)
    expect(Object.keys(state.sessions.s1.autoHandoffEvents).sort()).toEqual(['40', '50', '60'])
  })

  it('preserves legacy session fields as inert compatibility data', async () => {
    await saveSessionState({
      sessionId: 's1',
      thresholdEvents: { notice: { createdAt: '2026-07-07T00:00:00.000Z' } },
      checkpointEvents: { first: { createdAt: '2026-07-07T00:00:00.000Z' } }
    }, home)

    await saveSessionState({
      sessionId: 's1',
      lastObservedUsedPercentage: 44
    }, home)

    const state = await loadState(home)
    expect(state.sessions.s1.thresholdEvents.notice.createdAt).toBe('2026-07-07T00:00:00.000Z')
    expect(state.sessions.s1.checkpointEvents.first.createdAt).toBe('2026-07-07T00:00:00.000Z')
  })

  it('appends jsonl events', async () => {
    await appendEvent({ type: 'threshold', sessionId: 's1', band: 'notice' }, home)
    const content = await readFile(join(getContextRiskDir(home), 'events.jsonl'), 'utf8')
    expect(content.trim()).toBe('{"type":"threshold","sessionId":"s1","band":"notice"}')
  })
})
