import { loadConfig } from './config.js'
import { appendEvent } from './events.js'
import { createHandoffDraftRecord } from './handoff.js'
import { loadState, saveSessionState } from './state.js'

export async function maybeCreateAutoHandoff(input, home) {
  let session
  try {
    const state = await loadState(home)
    const sessionId = input.session_id ?? state.latestSessionId
    session = sessionId ? state.sessions[sessionId] : undefined
    if (!session) return undefined

    const config = await loadConfig(home)
    if (config.autoHandoff?.enabled === false) return undefined

    const percentage = session.lastObservedUsedPercentage
    if (!Number.isFinite(percentage)) return undefined

    const thresholds = normalizedThresholds(config.autoHandoff?.thresholds)
    const crossed = thresholds.filter(threshold => percentage >= threshold)
    const pending = crossed.filter(threshold => !session.autoHandoffEvents?.[String(threshold)])
    if (pending.length === 0) return undefined

    const threshold = pending[pending.length - 1]
    const cwd = resolveCwd(input, session)
    const createdAt = new Date().toISOString()
    const record = await createHandoffDraftRecord({
      cwd,
      objective: `Continue work from ContextRisk auto handoff at ${threshold}% context usage`,
      sessionId: session.sessionId,
      transcriptPath: input.transcript_path ?? session.transcriptPath,
      thresholdPercentage: threshold
    })

    const handledEvents = Object.fromEntries(
      crossed
        .filter(value => value <= threshold)
        .map(value => [String(value), {
          createdAt,
          threshold: value,
          handoffId: record.id,
          handoffPath: record.path
        }])
    )

    await saveSessionState({
      ...session,
      autoHandoffEvents: {
        ...session.autoHandoffEvents,
        ...handledEvents
      }
    }, home)

    await appendEvent({
      type: 'auto_handoff_created',
      sessionId: session.sessionId,
      hookEventName: input.hook_event_name,
      threshold,
      observedPercentage: percentage,
      handoffId: record.id,
      handoffPath: record.path,
      handledThresholds: Object.keys(handledEvents).map(Number)
    }, home)

    return autoHandoffHookOutput(input, threshold, record)
  } catch (error) {
    await appendAutoHandoffError(input, session, error, home)
    return undefined
  }
}

function normalizedThresholds(thresholds) {
  const values = Array.isArray(thresholds) ? thresholds : [40, 50, 60, 70, 80, 90]
  return [...new Set(values)]
    .filter(value => Number.isFinite(value))
    .sort((first, second) => first - second)
}

function resolveCwd(input, session) {
  return input.cwd ??
    input.workspace?.current_dir ??
    session.cwd ??
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
