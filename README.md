# ContextRisk

**Language:** English | [中文](README.zh-CN.md)

ContextRisk is a Claude Code plugin that watches context usage and automatically creates structured handoffs when the current window reaches 40%, 50%, and each 10% threshold after that. It preserves your existing status line and gives you a clean `/new` plus `/context-risk:continue <handoff-id>` path without blocking normal work.

**Repository:** [SodaZheng/context-risk](https://github.com/SodaZheng/context-risk)

![ContextRisk architecture](docs/context-risk-readme-architecture.png)

## Project Background And Goals

ContextRisk comes from a recurring engineering problem: during long Claude Code or model-assisted development sessions, context quality often starts degrading well before the window is near full. In practice, many models become less reliable after context usage passes roughly 40%. They may retain less of the original constraints, drift from the current objective, lose track of important code paths, or make weaker risk judgments. Continuing in the same window can quietly turn from productive work into accumulated task drift.

The usual recovery paths are imperfect. Built-in compaction can reduce context size, but the retained details and priorities are not fully controllable. Opening a fresh window gives the model a cleaner context, but it is hard to restate exactly what has been done, which assumptions were verified, where the task should resume, and which earlier constraints must not be lost.

ContextRisk treats context degradation as an observable workflow risk rather than a normal cost of long sessions. Its goal is not to extend one window indefinitely. Instead, it prepares fresh handoff checkpoints as context risk rises so unfinished work can continue in a clean window from verifiable task state.

![ContextRisk context risk and handoff workflow](docs/context-risk-readme-context-flow.png)

## What It Solves

Long implementation, debugging, large file reading, and multi-agent work can push a Claude Code session into a high-risk context range. Once the model starts losing earlier constraints, continuing in the same window often causes repeated exploration, weak decisions, and hard-to-recover task drift.

ContextRisk is not designed to copy a full transcript into a new window. It captures the facts, objective, open work, risks, and verification evidence needed to continue the task with less context debt.

## Core Capabilities

### Context Risk Awareness

ContextRisk reads the context usage reported through Claude Code's status line and records the latest observed risk state. It uses Claude Code hooks as sensors, then creates a fresh handoff when the latest observed percentage crosses an auto-handoff threshold.

Default auto-handoff thresholds:

| Threshold | Message |
| --- | --- |
| 40% | Suggest switching windows. |
| 50% | Suggest switching soon. |
| 60%, 70%, 80%, 90% | Strongly suggest switching. |

### Status Line Preservation

During installation, ContextRisk wraps the existing Claude Code status line while preserving the user's original output and settings. You keep your current status line experience, and ContextRisk records only the local risk state it needs.

After plugin updates, ContextRisk repairs the wrapper automatically through the `SessionStart` hook on the next session start. You usually do not need to run `repair` manually; it is a fallback for force refreshes and troubleshooting.

### Automatic Handoff Checkpoints

ContextRisk uses Claude Code hooks as sensors. When the latest observed context usage crosses 40%, 50%, 60%, 70%, 80%, or 90%, it creates a fresh handoff under `.context-risk/handoffs/` and suggests:

```text
/new
/context-risk:continue <handoff-id>
```

The default behavior is non-blocking. ContextRisk does not stop prompts, tools, subagents, or compaction; it prepares safer continuation points and lets you decide when to switch.

### Structured Handoff

When the current window reaches an auto-handoff threshold, or when you manually ask for a clean continuation point, ContextRisk creates a handoff. A handoff captures:

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
2. When ContextRisk creates an automatic handoff, choose whether to switch now or continue briefly.
3. To switch, open a fresh Claude Code window:

   ```text
   /new
   ```

4. Continue from the handoff ID shown by ContextRisk:

   ```text
   /context-risk:continue <handoff-id>
   ```

5. The new window verifies the project state, restates the task context, and continues from the first unfinished todo.

## Configuration

ContextRisk defaults to automatic handoffs at 40%, 50%, 60%, 70%, 80%, and 90%. Advanced workflow changes are driven by the local auto-handoff configuration.

Advanced local overrides can be written to:

```text
~/.claude/context-risk/config.json
```

Example:

```json
{
  "autoHandoff": {
    "enabled": true,
    "thresholds": [40, 50, 60, 70, 80, 90]
  }
}
```

Start with the defaults unless your workflow really needs earlier or later handoff checkpoints.

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
