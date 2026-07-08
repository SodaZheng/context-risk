import { maybeCreateAutoHandoff } from './auto-handoff.js'

const observedHookEvents = new Set([
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolBatch',
  'Stop',
  'SubagentStop',
  'PreCompact',
  'PostCompact'
])

/**
 * @param {Record<string, any>} input
 * @param {string=} home
 * @returns {Promise<Record<string, any> | undefined>}
 */
export async function handleHook(input, home) {
  if (!observedHookEvents.has(input.hook_event_name)) return undefined
  return maybeCreateAutoHandoff(input, home)
}
