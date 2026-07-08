---
description: Show ContextRisk's latest local auto-handoff state and recent auto handoff events.
disable-model-invocation: true
allowed-tools: Bash Read
---

Show the current ContextRisk auto-handoff state.

1. Run:

```bash
test -f ~/.claude/context-risk/state.json && cat ~/.claude/context-risk/state.json || echo "No ContextRisk state found"
```

2. Run:

```bash
test -f ~/.claude/context-risk/events.jsonl && tail -20 ~/.claude/context-risk/events.jsonl || echo "No ContextRisk events found"
```

3. Summarize the latest session ID, last observed used percentage, transcript path, `autoHandoffEvents`, and recent `auto_handoff_created` or `auto_handoff_error` events.
