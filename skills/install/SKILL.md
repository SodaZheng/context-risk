---
description: Install ContextRisk's status line wrapper after installing the plugin from a marketplace.
disable-model-invocation: true
allowed-tools: Bash
argument-hint: "[--settings <path>]"
---

Install ContextRisk's status line wrapper.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" install $ARGUMENTS
```

Then report whether the command succeeded. Mention that this backs up
`~/.claude/settings.json`, stores the original status line in
`~/.claude/context-risk/original-statusline.json`, and updates only
`statusLine.command`.
