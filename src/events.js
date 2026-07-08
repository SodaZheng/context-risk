import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureContextRiskDir } from './config.js'

export async function appendEvent(event, home) {
  const dir = await ensureContextRiskDir(home)
  await appendFile(join(dir, 'events.jsonl'), `${JSON.stringify(event)}\n`, 'utf8')
}
