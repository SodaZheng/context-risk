---
description: Create a structured ContextRisk handoff when context is high or the user wants to continue in a new Claude Code window.
disable-model-invocation: false
allowed-tools: Bash Read Write
---

Create a task handoff for a clean new Claude Code window.

1. Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" handoff draft --cwd "$PWD" --objective "$ARGUMENTS"
```

2. Read the generated `.context-risk/handoffs/*.md` file.
3. Fill every section with concise, evidence-backed information from the current task.
4. Keep the handoff focused on state needed to continue, not full conversation history.
5. Separate verified facts from unverified assumptions.
6. End by showing the user the new-window prompt from the handoff.
