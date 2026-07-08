import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { collectProjectMetadata, ensureProjectStateDir } from './project.js'

export async function createHandoffDraft(options) {
  await ensureProjectStateDir(options.cwd)
  const metadata = await collectProjectMetadata(options.cwd)
  const id = handoffId(options.objective)
  const path = join(options.cwd, '.context-risk', 'handoffs', `${id}.md`)
  await writeFile(path, renderHandoff({
    id,
    objective: options.objective ?? 'Unspecified objective',
    sessionId: options.sessionId ?? 'unknown',
    transcriptPath: options.transcriptPath ?? 'unknown',
    cwd: metadata.cwd,
    gitSummary: metadata.gitSummary
  }), 'utf8')
  return path
}

function handoffId(objective) {
  const date = new Date().toISOString().slice(0, 10)
  const slug = (objective ?? 'handoff')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'handoff'
  return `${date}-${slug}`
}

function renderHandoff(input) {
  return `# ContextRisk Handoff: ${input.id}

## Task Identity

- Handoff ID: ${input.id}
- Original session_id: ${input.sessionId}
- Original transcript_path: ${input.transcriptPath}
- Project cwd: ${input.cwd}

## Git State

\`\`\`text
${input.gitSummary}
\`\`\`

## Current Objective

${input.objective}

## Completed Work

- Capture completed work here before opening a new window.

## Unfinished Todos

- Capture the next concrete step here.

## Key Decisions

- Capture decisions and rationale here.

## Key Files

- Capture file paths and line references here.

## Commands And Results

- Capture commands already run and summarized outcomes here.

## Verified Facts

- Capture facts backed by files, tests, or command output here.

## Unverified Assumptions

- Capture assumptions that the next window must verify here.

## Known Risks

- Capture risks, blockers, and uncertainty here.

## Recommended Next Step

Read this handoff, verify the current project state, then continue with the first unfinished todo.

## New Window Prompt

\`\`\`text
Continue handoff: ${input.id}.
Read .context-risk/handoffs/${input.id}.md first.
Restate the objective, completed work, open todos, risks, and next step.
Do not assume details that are not in the handoff. Verify by reading files or running commands when needed.
\`\`\`
`
}
