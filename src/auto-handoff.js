import { randomUUID } from 'node:crypto'
import { loadConfig } from './config.js'
import { appendEvent } from './events.js'
import { createHandoffDraftRecord } from './handoff.js'
import { updateState } from './state.js'

const pendingClaimTtlMs = 2 * 60 * 1000

export async function maybeCreateAutoHandoff(input, home) {
  let claim
  try {
    const config = await loadConfig(home)
    if (config.autoHandoff?.enabled === false) return undefined

    claim = await claimAutoHandoff(input, config, home)
    if (!claim) return undefined

    const cwd = resolveCwd(input, claim.session)
    const record = await createHandoffDraftRecord({
      cwd,
      objective: `Continue work from ContextRisk auto handoff at ${claim.threshold}% context usage`,
      sessionId: claim.session.sessionId,
      transcriptPath: input.transcript_path ?? claim.session.transcriptPath,
      thresholdPercentage: claim.threshold
    })

    const finalized = await finalizeAutoHandoffClaim(claim, record, home)
    if (!finalized) return undefined

    await appendEvent({
      type: 'auto_handoff_created',
      sessionId: claim.session.sessionId,
      hookEventName: input.hook_event_name,
      threshold: claim.threshold,
      observedPercentage: claim.percentage,
      handoffId: record.id,
      handoffPath: record.path,
      handledThresholds: claim.handledThresholds
    }, home)

    return autoHandoffHookOutput(input, claim.threshold, record)
  } catch (error) {
    if (claim) {
      try {
        await releaseAutoHandoffClaim(claim, home)
      } catch {
        // Preserve the original auto-handoff failure for event reporting.
      }
    }
    await appendAutoHandoffError(input, claim?.session, error, home)
    return undefined
  }
}

async function claimAutoHandoff(input, config, home) {
  const claimId = randomUUID()
  const createdAt = new Date().toISOString()
  const now = Date.now()
  const { result } = await updateState(state => {
    const sessionId = input.session_id ?? state.latestSessionId
    const session = sessionId ? state.sessions[sessionId] : undefined
    if (!session) return undefined
    const canonicalSessionId = session.sessionId ?? sessionId

    const percentage = session.lastObservedUsedPercentage
    if (!Number.isFinite(percentage)) return undefined

    const thresholds = normalizedThresholds(config.autoHandoff?.thresholds)
    const crossed = thresholds.filter(threshold => percentage >= threshold)
    const pending = crossed.filter(threshold => isUnhandledAutoHandoffEvent(
      session.autoHandoffEvents?.[String(threshold)],
      now
    ))
    if (pending.length === 0) return undefined

    const threshold = pending[pending.length - 1]
    const handledThresholds = crossed.filter(value => value <= threshold)
    const autoHandoffEvents = {
      ...session.autoHandoffEvents
    }

    for (const value of handledThresholds) {
      autoHandoffEvents[String(value)] = {
        createdAt,
        threshold: value,
        status: 'pending',
        claimId
      }
    }

    state.latestSessionId = canonicalSessionId
    state.sessions[canonicalSessionId] = {
      ...session,
      sessionId: canonicalSessionId,
      autoHandoffEvents
    }

    return {
      claimId,
      createdAt,
      session: { ...session, sessionId: canonicalSessionId },
      percentage,
      threshold,
      handledThresholds
    }
  }, home)

  return result
}

function isUnhandledAutoHandoffEvent(event, now) {
  if (!event) return true
  if (event.status !== 'pending') return false

  const claimedAt = Date.parse(event.createdAt)
  return Number.isFinite(claimedAt) && now - claimedAt > pendingClaimTtlMs
}

async function finalizeAutoHandoffClaim(claim, record, home) {
  const { result } = await updateState(state => {
    const session = state.sessions[claim.session.sessionId]
    if (!session) return false

    const autoHandoffEvents = {
      ...session.autoHandoffEvents
    }
    let finalizedThreshold = false

    for (const threshold of claim.handledThresholds) {
      const key = String(threshold)
      if (autoHandoffEvents[key]?.claimId !== claim.claimId) continue
      autoHandoffEvents[key] = {
        createdAt: claim.createdAt,
        threshold,
        handoffId: record.id,
        handoffPath: record.path
      }
      if (threshold === claim.threshold) finalizedThreshold = true
    }

    state.sessions[session.sessionId] = {
      ...session,
      autoHandoffEvents
    }

    return finalizedThreshold
  }, home)

  return result === true
}

async function releaseAutoHandoffClaim(claim, home) {
  await updateState(state => {
    const session = state.sessions[claim.session.sessionId]
    if (!session?.autoHandoffEvents) return

    const autoHandoffEvents = {
      ...session.autoHandoffEvents
    }

    for (const threshold of claim.handledThresholds) {
      const key = String(threshold)
      if (autoHandoffEvents[key]?.claimId === claim.claimId) {
        delete autoHandoffEvents[key]
      }
    }

    state.sessions[session.sessionId] = {
      ...session,
      autoHandoffEvents
    }

    if (Object.keys(autoHandoffEvents).length === 0) {
      delete state.sessions[session.sessionId].autoHandoffEvents
    }
  }, home)
}

function normalizedThresholds(thresholds) {
  const values = Array.isArray(thresholds) ? thresholds : [40, 50, 60, 70, 80, 90]
  return [...new Set(values)]
    .filter(value => Number.isFinite(value))
    .sort((first, second) => first - second)
}

function resolveCwd(input, session) {
  return input.workspace?.current_dir ??
    session.cwd ??
    input.cwd ??
    process.cwd()
}

function autoHandoffHookOutput(input, threshold, record) {
  const message = autoHandoffMessage(threshold, record)
  return {
    systemMessage: message,
    hookSpecificOutput: {
      hookEventName: input.hook_event_name,
      additionalContext: message
    }
  }
}

function autoHandoffMessage(threshold, record) {
  const recommendation = recommendationForThreshold(threshold)
  return [
    `ContextRisk auto handoff created at ${threshold}% context usage.`,
    '',
    `Handoff: ${record.path}`,
    '',
    `Recommended next: ${recommendation}`,
    '/new',
    `/context-risk:continue ${record.id}`
  ].join('\n')
}

function recommendationForThreshold(threshold) {
  if (threshold >= 60) return 'strongly recommended to switch now'
  if (threshold >= 50) return 'switch soon'
  return 'switch when convenient'
}

async function appendAutoHandoffError(input, session, error, home) {
  try {
    await appendEvent({
      type: 'auto_handoff_error',
      sessionId: session?.sessionId ?? input.session_id,
      hookEventName: input.hook_event_name,
      message: error instanceof Error ? error.message : String(error)
    }, home)
  } catch {
    // Error reporting must not interrupt the Claude Code session.
  }
}
