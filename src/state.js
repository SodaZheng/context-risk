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
  const existingSession = withoutLegacySessionFields(existing)
  const nextSession = withoutLegacySessionFields(session)
  const autoHandoffEvents = {
    ...existing?.autoHandoffEvents,
    ...session.autoHandoffEvents
  }
  const merged = {
    ...existingSession,
    ...nextSession
  }
  if (Object.keys(autoHandoffEvents).length > 0) merged.autoHandoffEvents = autoHandoffEvents

  state.latestSessionId = session.sessionId
  state.sessions[session.sessionId] = merged
  await writeState(state, home)
  return state
}

function withoutLegacySessionFields(session = {}) {
  const { thresholdEvents, checkpointEvents, ...supported } = session
  void thresholdEvents
  void checkpointEvents
  return supported
}
