import { mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const defaultConfig = {
  thresholds: {
    notice: 40,
    softBlock: 50,
    handoffRecommended: 65,
    highRisk: 80
  },
  preferHandoffOverCompact: true,
  maxToolBatchCharsBeforeBlock: 50000,
  maxSingleToolCharsBeforeWarning: 20000,
  checkpointOncePerThreshold: true,
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
  return {
    ...defaultConfig,
    ...parsed,
    thresholds: {
      ...defaultConfig.thresholds,
      ...parsed.thresholds
    }
  }
}
