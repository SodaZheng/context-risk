import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureContextRiskDir } from './config.js'

const emptyState = () => ({
  version: 1,
  sessions: {}
})

export async function loadState(home) {
  const dir = await ensureContextRiskDir(home)
  const statePath = join(dir, 'state.json')

  try {
    return JSON.parse(await readFile(statePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return emptyState()
    throw error
  }
}

export async function writeState(state, home) {
  const dir = await ensureContextRiskDir(home)
  const statePath = join(dir, 'state.json')
  const tmpPath = `${statePath}.${process.pid}.tmp`
  await writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(tmpPath, statePath)
}

export async function saveSessionState(session, home) {
  const state = await loadState(home)
  const existing = state.sessions[session.sessionId]
  const merged = {
    ...existing,
    ...session,
    thresholdEvents: {
      ...existing?.thresholdEvents,
      ...session.thresholdEvents
    },
    checkpointEvents: {
      ...existing?.checkpointEvents,
      ...session.checkpointEvents
    }
  }

  state.latestSessionId = session.sessionId
  state.sessions[session.sessionId] = merged
  await writeState(state, home)
  return state
}
