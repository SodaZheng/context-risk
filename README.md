# ContextRisk

**Language:** English | [中文](README.zh-CN.md)

ContextRisk is a Claude Code plugin that warns before the context window becomes risky, preserves your existing status line, and creates structured handoffs so unfinished work can continue in a clean Claude Code window.

**Repository:** [SodaZheng/context-risk](https://github.com/SodaZheng/context-risk)

![ContextRisk architecture](docs/context-risk-readme-architecture.png)

## What It Solves

Long implementation, debugging, large file reading, and multi-agent work can push a Claude Code session into a high-risk context range. Once the model starts losing earlier constraints, continuing in the same window often causes repeated exploration, weak decisions, and hard-to-recover task drift.

ContextRisk is not designed to copy a full transcript into a new window. It captures the facts, objective, open work, risks, and verification evidence needed to continue the task with less context debt.

## Core Capabilities

### Context Risk Awareness

ContextRisk reads the context usage reported through Claude Code's status line and records the latest observed risk state. It can warn, recommend a handoff, or block normal continuation when the session is becoming unsafe to extend.

Default risk levels:

| Level | Default threshold | Meaning |
| --- | ---: | --- |
| Notice | 40% | Context growth is becoming visible. |
| Soft block | 50% | Normal continuation should pause. |
| Handoff recommended | 65% | A fresh-window handoff is strongly recommended. |
| High risk | 80% | Continuing in the current window is risky. |

### Status Line Preservation

During installation, ContextRisk wraps the existing Claude Code status line while preserving the user's original output and settings. You keep your current status line experience, and ContextRisk records only the local risk state it needs.

After plugin updates, ContextRisk repairs the wrapper automatically through the `SessionStart` hook on the next session start. You usually do not need to run `repair` manually; it is a fallback for force refreshes and troubleshooting.

### Risk Guardrails

ContextRisk protects the workflow at points where avoidable context growth usually happens:

| Scenario | Protection |
| --- | --- |
| Continuing with a new prompt | Warns or blocks when context risk is high. |
| Very broad file reads or command output | Blocks obviously oversized operations. |
| Large tool batches | Stops before the next model call so the user can recover. |
| Oversized subagent results | Prevents huge subtask output from flooding the main session. |
| Stop and compact lifecycle | Records events and suggests checkpoint or handoff actions. |

These guardrails are user-facing workflow protections. You do not need to understand the plugin internals to use them.

### Structured Handoff

When the current window is getting risky, or when you simply want a clean continuation point, ContextRisk can create a handoff. A handoff captures:

- current objective
- completed work
- unfinished todos
- key files and project state
- verified facts and unverified assumptions
- known risks
- recommended next step
- prompt text for the new window

When a new window continues from a handoff ID, ContextRisk reads the project handoff file, checks the current directory and git state, then resumes from evidence instead of relying on long-context memory.

### Local State And Privacy

ContextRisk writes only to the local machine and the current project:

```text
~/.claude/context-risk/
  state.json
  events.jsonl
  original-statusline.json
  statusline-wrapper.mjs
```

```text
.context-risk/
  handoffs/
  compacts/
```

Project handoffs should stay gitignored by default because they may contain local paths, task state, summaries, or other machine-local information. Review a handoff before sharing it.

## Installation

### From A GitHub Marketplace Repository

```text
/plugin marketplace add SodaZheng/context-risk
/plugin install context-risk@context-risk-marketplace
/context-risk:install
```

### From A Local Checkout

```text
/plugin marketplace add /absolute/path/to/ContextRisk
/plugin install context-risk@context-risk-marketplace
/context-risk:install
```

`/context-risk:install` backs up `~/.claude/settings.json`, stores the previous status line configuration, and updates only Claude Code's `statusLine.command`.

## Commands

| Command | Purpose |
| --- | --- |
| `/context-risk:install` | Install the status line wrapper and enable context risk recording. |
| `/context-risk:repair` | Force-refresh the status line wrapper; usually unnecessary except for troubleshooting or immediate repair. |
| `/context-risk:uninstall` | Uninstall ContextRisk and restore the previous status line. |
| `/context-risk:risk-check` | Show recent context state and risk events. |
| `/context-risk:handoff [objective]` | Create a structured handoff for the current task. |
| `/context-risk:continue <handoff-id>` | Continue from a handoff in a new window. |
| `/context-risk:compact-plan` | Generate a safer `/compact` instruction. |

## Recommended Workflow

1. Use Claude Code normally for development, debugging, or project analysis.
2. When ContextRisk warns that context risk is rising, pause before adding more large inputs.
3. Create a handoff in the current window:

   ```text
   /context-risk:handoff Finish the current implementation safely
   ```

4. Open a fresh Claude Code window in the same project.
5. Continue from the handoff ID:

   ```text
   /context-risk:continue <handoff-id>
   ```

6. The new window verifies the project state, restates the task context, and continues from the first unfinished todo.

## Configuration

The plugin manifest exposes `softBlockThreshold`, defaulting to `50`. Adjust it if you want ContextRisk to start soft-blocking earlier or later.

Advanced local overrides can be written to:

```text
~/.claude/context-risk/config.json
```

Example:

```json
{
  "thresholds": {
    "softBlock": 55
  },
  "maxToolBatchCharsBeforeBlock": 70000
}
```

Start with the defaults unless your project needs stricter or looser thresholds.

## Update, Auto-Repair, And Uninstall

After a marketplace update, you usually only need to start the next Claude Code session. ContextRisk uses the `SessionStart` hook to refresh the status line wrapper so it points at the updated plugin cache path.

Run `repair` manually only when:

- you just updated the plugin and want to force-refresh the current session immediately;
- auto-repair did not take effect and the status line still points at an old plugin cache;
- `/context-risk:risk-check` shows stale or abnormal state during troubleshooting.

```text
/context-risk:repair
```

To uninstall, restore the status line first and then uninstall the plugin:

```text
/context-risk:uninstall
/plugin uninstall context-risk
```

## Troubleshooting

### Plugin Not Found

Refresh the marketplace and install again:

```text
/plugin marketplace update context-risk-marketplace
/plugin install context-risk@context-risk-marketplace
```

### Hooks Run But Context Usage Is Missing

Install the status line wrapper, then inspect state:

```text
/context-risk:install
/context-risk:risk-check
```

### Status Line Looks Wrong After An Update

First open a new Claude Code session so the `SessionStart` auto-repair hook can run. If the status line still looks wrong, run:

```text
/context-risk:repair
```

### Restore The Previous Status Line

Run:

```text
/context-risk:uninstall
```

If needed, inspect backups near `~/.claude/settings.json`.

## Development And Release

ContextRisk is designed for marketplace installation. Users do not need a global CLI, build artifact, or extra dependency installation. Maintainers should run at least:

```bash
npm test
npm run verify
```

Before publishing, confirm that marketplace metadata, the plugin manifest, hooks, and skills are committed. Add a `LICENSE` file before a public open-source release.
