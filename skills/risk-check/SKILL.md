---
description: Show ContextRisk's latest local risk state and recent threshold events.
disable-model-invocation: true
allowed-tools: Bash Read
---

Show the current ContextRisk state.

1. Run:

```bash
test -f ~/.claude/context-risk/state.json && cat ~/.claude/context-risk/state.json || echo "No ContextRisk state found"
```

2. Run:

```bash
test -f ~/.claude/context-risk/events.jsonl && tail -20 ~/.claude/context-risk/events.jsonl || echo "No ContextRisk events found"
```

3. Summarize the latest session ID, last observed used percentage, transcript path, and any recent threshold events.
