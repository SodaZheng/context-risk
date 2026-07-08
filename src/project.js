import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function ensureProjectStateDir(cwd) {
  const dir = join(cwd, '.context-risk')
  await mkdir(join(dir, 'handoffs'), { recursive: true })
  await mkdir(join(dir, 'compacts'), { recursive: true })
  await writeGitignore(dir)
}

export async function collectProjectMetadata(cwd) {
  return {
    cwd,
    gitSummary: await gitSummary(cwd)
  }
}

async function writeGitignore(dir) {
  const path = join(dir, '.gitignore')
  const desired = 'handoffs/\ncompacts/\n'
  try {
    const current = await readFile(path, 'utf8')
    if (current.includes('handoffs/') && current.includes('compacts/')) return
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  await writeFile(path, desired, 'utf8')
}

async function gitSummary(cwd) {
  try {
    const [{ stdout: branch }, { stdout: head }, { stdout: status }] = await Promise.all([
      execFileAsync('git', ['branch', '--show-current'], { cwd }),
      execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { cwd }),
      execFileAsync('git', ['status', '--short'], { cwd })
    ])
    return [
      `branch: ${branch.trim() || 'detached'}`,
      `head: ${head.trim()}`,
      `dirty_files:\n${status.trim() || 'none'}`
    ].join('\n')
  } catch {
    return 'git: unavailable'
  }
}
