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
  const currentStatusLine = settings.statusLine

  if (!currentStatusLine?.command || !currentStatusLine.command.includes(wrapperMarker)) {
    await writeFile(originalPath, `${JSON.stringify(currentStatusLine ?? {}, null, 2)}\n`, 'utf8')
  }

  const wrapperPath = join(dir, wrapperMarker)
  await writeFile(wrapperPath, createStatusLineWrapperSource(), { encoding: 'utf8', mode: 0o755 })

  settings.statusLine = {
    ...(currentStatusLine ?? {}),
    type: 'command',
    command: `node "${wrapperPath}"`
  }

  await backupSettings(settingsPath)
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
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
  if (!currentStatusLine?.command || !currentStatusLine.command.includes(wrapperMarker)) {
    return false
  }

  const dir = getContextRiskDir(home)
  await mkdir(dir, { recursive: true })

  const wrapperPath = join(dir, wrapperMarker)
  const expectedWrapperSource = createStatusLineWrapperSource()
  const expectedCommand = `node "${wrapperPath}"`
  const needsWrapperUpdate = await fileContentDiffers(wrapperPath, expectedWrapperSource)
  const needsSettingsUpdate = currentStatusLine.command !== expectedCommand

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
