import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getContextRiskDir } from './config.js'
import { createStatusLineWrapperSource } from './statusline.js'

const wrapperMarker = 'statusline-wrapper.mjs'

export async function installStatusLineWrapper(settingsPath, home) {
  const settings = await readSettings(settingsPath)
  const dir = getContextRiskDir(home)
  await mkdir(dir, { recursive: true })

  const originalPath = join(dir, 'original-statusline.json')
  const wrapperPath = join(dir, wrapperMarker)
  const expectedCommand = wrapperCommand(wrapperPath)
  const expectedWrapperSource = createStatusLineWrapperSource()
  const currentStatusLine = settings.statusLine
  const currentIsWrapper = isContextRiskWrapperCommand(currentStatusLine?.command, wrapperPath)

  if (!currentIsWrapper) {
    await writeFile(originalPath, `${JSON.stringify(currentStatusLine ?? {}, null, 2)}\n`, 'utf8')
  }

  if (await fileContentDiffers(wrapperPath, expectedWrapperSource)) {
    await writeFile(wrapperPath, expectedWrapperSource, { encoding: 'utf8', mode: 0o755 })
  }

  settings.statusLine = {
    ...(currentStatusLine ?? {}),
    type: 'command',
    command: expectedCommand
  }

  const nextSettings = `${JSON.stringify(settings, null, 2)}\n`
  if (await fileContentDiffers(settingsPath, nextSettings)) {
    await backupSettings(settingsPath)
    await writeFile(settingsPath, nextSettings, 'utf8')
  }
}

export async function uninstallStatusLineWrapper(settingsPath, home) {
  const settings = await readSettings(settingsPath)
  const originalPath = join(getContextRiskDir(home), 'original-statusline.json')
  const original = JSON.parse(await readFile(originalPath, 'utf8'))
  await backupSettings(settingsPath)
  if (Object.keys(original).length === 0) {
    delete settings.statusLine
  } else {
    settings.statusLine = original
  }
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}

export async function repairStatusLineWrapper(settingsPath, home) {
  await installStatusLineWrapper(settingsPath, home)
}

export async function autoRepairStatusLineWrapper(settingsPath, home) {
  const settings = await readSettings(settingsPath)
  const currentStatusLine = settings.statusLine
  const dir = getContextRiskDir(home)
  const wrapperPath = join(dir, wrapperMarker)
  const expectedCommand = wrapperCommand(wrapperPath)
  if (!isContextRiskWrapperCommand(currentStatusLine?.command, wrapperPath)) {
    return false
  }

  await mkdir(dir, { recursive: true })

  const expectedWrapperSource = createStatusLineWrapperSource()
  const needsWrapperUpdate = await fileContentDiffers(wrapperPath, expectedWrapperSource)
  const needsSettingsUpdate = currentStatusLine.command !== expectedCommand || currentStatusLine.type !== 'command'

  if (!needsWrapperUpdate && !needsSettingsUpdate) return false

  if (needsWrapperUpdate) {
    await writeFile(wrapperPath, expectedWrapperSource, { encoding: 'utf8', mode: 0o755 })
  }

  if (needsSettingsUpdate) {
    settings.statusLine = {
      ...currentStatusLine,
      type: 'command',
      command: expectedCommand
    }
    await backupSettings(settingsPath)
    await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  }

  return true
}

function wrapperCommand(wrapperPath) {
  return `node "${wrapperPath}"`
}

function isContextRiskWrapperCommand(command, wrapperPath) {
  if (typeof command !== 'string') return false
  const trimmed = command.trim()
  return trimmed === wrapperCommand(wrapperPath) ||
    trimmed === `node '${wrapperPath}'` ||
    trimmed === `node ${wrapperPath}`
}

async function readSettings(settingsPath) {
  try {
    return JSON.parse(await readFile(settingsPath, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await mkdir(dirname(settingsPath), { recursive: true })
    return {}
  }
}

async function fileContentDiffers(path, expected) {
  try {
    return await readFile(path, 'utf8') !== expected
  } catch (error) {
    if (error.code === 'ENOENT') return true
    throw error
  }
}

async function backupSettings(settingsPath) {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await copyFile(settingsPath, `${settingsPath}.context-risk-${stamp}.bak`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
