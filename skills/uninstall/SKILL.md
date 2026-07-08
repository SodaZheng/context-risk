---
description: Uninstall ContextRisk's status line wrapper and restore the previous status line.
disable-model-invocation: true
allowed-tools: Bash
argument-hint: "[--settings <path>]"
---

Uninstall ContextRisk's status line wrapper.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" uninstall $ARGUMENTS
```

Then report whether the command succeeded. This restores the original status
line when `~/.claude/context-risk/original-statusline.json` is available.
