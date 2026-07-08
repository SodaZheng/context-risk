---
description: Continue from a ContextRisk handoff ID in a new Claude Code window.
disable-model-invocation: true
allowed-tools: Read Bash
argument-hint: "<handoff-id>"
---

Continue from a ContextRisk handoff.

1. Treat `$ARGUMENTS` as the handoff ID.
2. Read `.context-risk/handoffs/$ARGUMENTS.md`.
3. Verify that the current directory matches the handoff project cwd.
4. Run `git status --short` if this is a git repository.
5. Restate:
   - objective
   - completed work
   - unfinished todos
   - key files
   - verified facts
   - unverified assumptions
   - known risks
   - next step
6. Ask for no confirmation unless the handoff is missing or the current directory clearly does not match.
7. Continue by verifying the first unfinished todo with targeted reads or commands.
