---
description: Create a no-argument structured ContextRisk handoff from the full current conversation when context is high or the user wants to continue in a new Claude Code window.
disable-model-invocation: false
allowed-tools: Bash Read Write
---

Create a task handoff for a clean new Claude Code window.

Do not ask the user for an objective and do not expect command arguments. Infer the
objective and continuation state from the entire current conversation.

1. Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" handoff draft --cwd "$PWD"
```

2. Read the generated `.context-risk/handoffs/*.md` file.
3. Rewrite every section using all relevant context available in the current
   conversation: user requests, corrections, decisions, assistant work, tool calls,
   command results, file changes, tests, unresolved issues, and risks.
4. Keep the handoff focused on state needed to continue, not full conversation history.
5. Separate verified facts from unverified assumptions.
6. Remove every placeholder and make the current objective explicit before finishing.
7. End by showing the user the new-window prompt from the handoff.
