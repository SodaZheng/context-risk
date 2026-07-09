import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { collectProjectMetadata, ensureProjectStateDir } from './project.js'
import { summarizeTranscript } from './transcript-summary.js'

export async function createHandoffDraft(options) {
  const record = await createHandoffDraftRecord(options)
  return record.path
}

export async function createHandoffDraftRecord(options) {
  await ensureProjectStateDir(options.cwd)
  const metadata = await collectProjectMetadata(options.cwd)
  const transcriptSummary = await summarizeTranscript(options.transcriptPath)
  return writeUniqueHandoff({
    handoffRoot: options.cwd,
    objective: options.objective ?? 'Unspecified objective',
    sessionId: options.sessionId ?? 'unknown',
    transcriptPath: options.transcriptPath ?? 'unknown',
    cwd: metadata.cwd,
    gitSummary: metadata.gitSummary,
    thresholdPercentage: options.thresholdPercentage,
    transcriptSummary
  })
}

async function writeUniqueHandoff(input) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const id = randomUUID()
    const path = join(input.handoffRoot, '.context-risk', 'handoffs', `${id}.md`)
    try {
      await writeFile(path, renderHandoff({
        ...input,
        id
      }), { encoding: 'utf8', flag: 'wx' })
      return { id, path }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
  }

  throw new Error('Unable to allocate unique handoff id')
}

function renderHandoff(input) {
  const summary = input.transcriptSummary
  const currentObjective = summary?.currentObjective ?? input.objective
  const completedWork = formatBullets(
    summary?.completedWork,
    'Capture completed work here before opening a new window.'
  )
  const unfinishedTodos = formatBullets(
    summary?.unfinishedTodos,
    'Capture the next concrete step here.'
  )
  const keyDecisions = formatBullets(
    summary?.keyDecisions,
    'Capture decisions and rationale here.'
  )
  const keyFiles = formatBullets(
    summary?.keyFiles,
    'Capture file paths and line references here.'
  )
  const commandsAndResults = formatBullets(
    summary?.commandsAndResults,
    'Capture commands already run and summarized outcomes here.'
  )
  const verifiedFacts = formatBullets(
    summary?.verifiedFacts,
    'Capture facts backed by files, tests, or command output here.'
  )
  const unverifiedAssumptions = formatBullets(
    summary?.unverifiedAssumptions,
    'Capture assumptions that the next window must verify here.'
  )
  const knownRisks = formatBullets(
    summary?.knownRisks,
    'Capture risks, blockers, and uncertainty here.'
  )
  const recommendedNextStep = summary?.recommendedNextStep ??
    'Read this handoff, verify the current project state, then continue with the first unfinished todo.'

  return `# ContextRisk Handoff: ${input.id}

## Task Identity

- Handoff ID: ${input.id}
- Original session_id: ${input.sessionId}
- Original transcript_path: ${input.transcriptPath}
- Project cwd: ${input.cwd}
${typeof input.thresholdPercentage === 'number' ? `- Auto handoff threshold: ${input.thresholdPercentage}%\n` : ''}

## Git State

\`\`\`text
${input.gitSummary}
\`\`\`

## Current Objective

${currentObjective}

## Completed Work

${completedWork}

## Unfinished Todos

${unfinishedTodos}

## Key Decisions

${keyDecisions}

## Key Files

${keyFiles}

## Commands And Results

${commandsAndResults}

## Verified Facts

${verifiedFacts}

## Unverified Assumptions

${unverifiedAssumptions}

## Known Risks

${knownRisks}

## Recommended Next Step

${recommendedNextStep}

## New Window Prompt

\`\`\`text
Continue handoff: ${input.id}.
Read .context-risk/handoffs/${input.id}.md first.
Restate the objective, completed work, open todos, risks, and next step.
Do not assume details that are not in the handoff. Verify by reading files or running commands when needed.
\`\`\`
`
}

function formatBullets(items, placeholder) {
  const values = Array.isArray(items) ? items.filter(Boolean) : []
  if (values.length === 0) return `- ${placeholder}`
  return values.map(item => `- ${item}`).join('\n')
}
