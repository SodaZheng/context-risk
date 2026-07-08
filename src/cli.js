#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHandoffDraft } from './handoff.js'
import { handleHook } from './hooks.js'
import { autoRepairStatusLineWrapper, installStatusLineWrapper, repairStatusLineWrapper, uninstallStatusLineWrapper } from './installer.js'
import { recordStatusLineInput } from './statusline.js'

async function main(argv) {
  const [command, subcommand, ...rest] = argv

  if (command === 'hook') {
    const input = JSON.parse(readFileSync(0, 'utf8'))
    input.hook_event_name = input.hook_event_name ?? subcommand
    const output = await handleHook(input)
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`)
    return
  }

  if (command === 'statusline') {
    const input = JSON.parse(readFileSync(0, 'utf8'))
    await recordStatusLineInput(input)
    return
  }

  if (command === 'install') {
    await installStatusLineWrapper(settingsPathFromArgs(compactArgs(subcommand, rest)))
    return
  }

  if (command === 'repair') {
    await repairStatusLineWrapper(settingsPathFromArgs(compactArgs(subcommand, rest)))
    return
  }

  if (command === 'auto-repair') {
    try {
      await autoRepairStatusLineWrapper(settingsPathFromArgs(compactArgs(subcommand, rest)))
    } catch {
      // SessionStart auto-repair must never interrupt the user's Claude Code session.
    }
    return
  }

  if (command === 'uninstall') {
    await uninstallStatusLineWrapper(settingsPathFromArgs(compactArgs(subcommand, rest)))
    return
  }

  if (command === 'handoff' && subcommand === 'draft') {
    const cwd = argValue(rest, '--cwd') ?? process.cwd()
    const objective = argValue(rest, '--objective')
    const sessionId = argValue(rest, '--session-id')
    const transcriptPath = argValue(rest, '--transcript-path')
    const path = await createHandoffDraft({ cwd, objective, sessionId, transcriptPath })
    process.stdout.write(`${path}\n`)
    return
  }

  throw new Error(`Unknown command: ${command ?? ''}`)
}

function settingsPathFromArgs(args) {
  const index = args.indexOf('--settings')
  if (index >= 0 && args[index + 1]) return args[index + 1]
  return join(homedir(), '.claude', 'settings.json')
}

function compactArgs(subcommand, rest) {
  return subcommand ? [subcommand, ...rest] : rest
}

function argValue(args, name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

main(process.argv.slice(2)).catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
