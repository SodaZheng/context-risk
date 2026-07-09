import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHandoffDraft, createHandoffDraftRecord } from '../src/handoff.js'

let cwd
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'context-risk-project-'))
})

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true })
})

describe('handoff generation', () => {
  it('creates a gitignored handoff draft with task identity fields', async () => {
    const handoffPath = await createHandoffDraft({
      cwd,
      objective: 'Build ContextRisk plugin',
      sessionId: 's1',
      transcriptPath: '/tmp/transcript.jsonl'
    })

    const content = await readFile(handoffPath, 'utf8')
    expect(content).toContain('# ContextRisk Handoff')
    expect(content).toContain('Build ContextRisk plugin')
    expect(content).toContain('s1')
    expect(content).toContain('/tmp/transcript.jsonl')
    expect(content).toContain('git: unavailable')

    const gitignore = await readFile(join(cwd, '.context-risk', '.gitignore'), 'utf8')
    expect(gitignore).toContain('handoffs/')
    expect(gitignore).toContain('compacts/')
  })

  it('can return handoff id and path for auto handoff callers', async () => {
    const record = await createHandoffDraftRecord({
      cwd,
      objective: 'Continue work from ContextRisk auto handoff at 60% context usage',
      sessionId: 's-auto',
      transcriptPath: '/tmp/auto-transcript.jsonl',
      thresholdPercentage: 60
    })

    expect(record.id).toMatch(uuidPattern)
    expect(record.path).toContain(`${record.id}.md`)

    const content = await readFile(record.path, 'utf8')
    expect(content).toContain('Auto handoff threshold: 60%')
    expect(content).toContain('s-auto')
    expect(content).toContain('/tmp/auto-transcript.jsonl')
  })

  it('uses a unique uuid handoff id for each draft', async () => {
    const first = await createHandoffDraftRecord({
      cwd,
      objective: 'Build ContextRisk plugin',
      sessionId: 's1',
      transcriptPath: '/tmp/transcript-1.jsonl'
    })
    const second = await createHandoffDraftRecord({
      cwd,
      objective: 'Build ContextRisk plugin',
      sessionId: 's2',
      transcriptPath: '/tmp/transcript-2.jsonl'
    })

    expect(first.id).toMatch(uuidPattern)
    expect(second.id).toMatch(uuidPattern)
    expect(second.id).not.toBe(first.id)
    expect(second.path).not.toBe(first.path)

    const handoffFiles = await readdir(join(cwd, '.context-risk', 'handoffs'))
    expect(handoffFiles).toHaveLength(2)

    const firstContent = await readFile(first.path, 'utf8')
    const secondContent = await readFile(second.path, 'utf8')
    expect(firstContent).toContain('s1')
    expect(secondContent).toContain('s2')
  })
})
