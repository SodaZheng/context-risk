---
description: Produce a safe /compact instruction that preserves task continuity at high context usage.
disable-model-invocation: false
allowed-tools: Read
---

Generate a guided compact instruction for the current task.

Output exactly one command block:

```text
/compact Preserve the task goal, current status, open todos, changed files, commands run, validation results, key decisions, known risks, and next step. Remove repeated exploration, chatter, and obsolete branches.
```

Then add a short note recommending `/context-risk:handoff` instead when the user wants the highest-quality continuation in a new window.
