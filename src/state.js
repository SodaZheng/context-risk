import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { ensureContextRiskDir } from './config.js'

const emptyState = () => ({
  version: 1,
  sessions: {}
})

const lockTimeoutMs = 3000
const lockRetryMs = 25
const staleLockMs = 30000

export async function loadState(home) {
  const dir = await ensureContextRiskDir(home)
  const statePath = join(dir, 'state.json')
  return readStateFile(statePath)
}

async function readStateFile(statePath) {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return emptyState()
    throw error
  }
}

export async function writeState(state, home) {
  const dir = await ensureContextRiskDir(home)
  const release = await acquireStateLock(dir)
  const statePath = join(dir, 'state.json')

  try {
    await writeStateFile(state, statePath)
  } finally {
    await release()
  }
}

async function writeStateFile(state, statePath) {
  const tmpPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(tmpPath, statePath)
}

export async function saveSessionState(session, home) {
  const { state } = await updateState(state => {
    mergeSessionState(state, session)
  }, home)
  return state
}

export async function updateState(mutator, home) {
  const dir = await ensureContextRiskDir(home)
  const release = await acquireStateLock(dir)
  const statePath = join(dir, 'state.json')

  try {
    const state = await readStateFile(statePath)
    const result = await mutator(state)
    await writeStateFile(state, statePath)
    return { state, result }
  } finally {
    await release()
  }
}

function mergeSessionState(state, session) {
  const existing = state.sessions[session.sessionId] ?? {}
  const nextSession = withoutUndefinedFields(session)
  const autoHandoffEvents = {
    ...existing.autoHandoffEvents,
    ...nextSession.autoHandoffEvents
  }
  const merged = {
    ...existing,
    ...nextSession
  }

  if (Object.keys(autoHandoffEvents).length > 0) {
    merged.autoHandoffEvents = autoHandoffEvents
  } else {
    delete merged.autoHandoffEvents
  }

  state.latestSessionId = session.sessionId
  state.sessions[session.sessionId] = merged
}

function withoutUndefinedFields(session = {}) {
  return Object.fromEntries(
    Object.entries(session).filter(([, value]) => value !== undefined)
  )
}

async function acquireStateLock(dir) {
  const lockPath = join(dir, 'state.json.lock')
  const startedAt = Date.now()

  while (true) {
    try {
      await mkdir(lockPath)
      return async () => {
        await rm(lockPath, { recursive: true, force: true })
      }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }

    await removeStaleLock(lockPath)
    if (Date.now() - startedAt > lockTimeoutMs) {
      throw new Error('Timed out waiting for ContextRisk state lock')
    }
    await sleep(lockRetryMs)
  }
}

async function removeStaleLock(lockPath) {
  try {
    const lockStat = await stat(lockPath)
    if (Date.now() - lockStat.mtimeMs > staleLockMs) {
      await rm(lockPath, { recursive: true, force: true })
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
