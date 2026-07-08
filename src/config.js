import { mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const defaultConfig = {
  autoHandoff: {
    enabled: true,
    thresholds: [40, 50, 60, 70, 80, 90]
  },
  preserveExistingStatusLine: true,
  minimalStatusLineWhenNoOriginal: true
}

export function getContextRiskDir(home = homedir()) {
  return join(home, '.claude', 'context-risk')
}

export async function ensureContextRiskDir(home = homedir()) {
  const dir = getContextRiskDir(home)
  await mkdir(dir, { recursive: true })
  return dir
}

export async function loadConfig(home = homedir()) {
  const dir = await ensureContextRiskDir(home)
  const configPath = join(dir, 'config.json')

  let raw
  try {
    raw = await readFile(configPath, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return defaultConfig
    throw error
  }

  const parsed = JSON.parse(raw)
  const {
    thresholds,
    preferHandoffOverCompact,
    maxToolBatchCharsBeforeBlock,
    maxSingleToolCharsBeforeWarning,
    checkpointOncePerThreshold,
    autoHandoff,
    ...supported
  } = parsed

  void thresholds
  void preferHandoffOverCompact
  void maxToolBatchCharsBeforeBlock
  void maxSingleToolCharsBeforeWarning
  void checkpointOncePerThreshold

  return {
    ...defaultConfig,
    ...supported,
    autoHandoff: {
      ...defaultConfig.autoHandoff,
      ...autoHandoff,
      thresholds: autoHandoff?.thresholds ?? defaultConfig.autoHandoff.thresholds
    }
  }
}
