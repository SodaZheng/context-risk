---
description: Force-refresh ContextRisk's status line wrapper when auto-repair did not take effect or immediate repair is needed.
disable-model-invocation: true
allowed-tools: Bash
argument-hint: "[--settings <path>]"
---

Force-refresh ContextRisk's status line wrapper.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" repair $ARGUMENTS
```

Then report whether the command succeeded. This is usually unnecessary after a
marketplace update because ContextRisk auto-repairs on the next session start.
Use it only when immediate refresh is needed or automatic repair did not take
effect.
