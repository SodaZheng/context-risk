# ContextRisk

**语言：** [English](README.md) | 中文

ContextRisk 是一个 Claude Code 插件，用来在上下文窗口变得危险之前提醒和拦截，保留你原有的状态栏，并生成结构化 handoff，让未完成任务可以在一个干净的新 Claude Code 窗口继续。

**仓库地址：** [SodaZheng/context-risk](https://github.com/SodaZheng/context-risk)

![ContextRisk architecture](docs/context-risk-readme-architecture.png)

## 它解决什么问题

长任务、调试、批量文件阅读和多代理协作很容易把上下文窗口推到高风险区域。一旦模型开始遗忘早期约束，继续硬做通常会带来错误判断、重复探索和难以恢复的状态漂移。

ContextRisk 的目标不是把完整对话塞进新窗口，而是把继续工作真正需要的事实、目标、待办、风险和验证证据整理成 handoff。它帮助你在上下文变差之前停下来，把任务交给一个上下文更干净的新窗口继续。

## 核心功能

### 上下文风险感知

ContextRisk 会读取 Claude Code 状态栏提供的上下文使用率，并记录最近一次观察到的风险状态。它会按照阈值给出提醒、建议 handoff，或者在继续对话可能明显不安全时阻止普通推进。

默认风险层级：

| 层级 | 默认阈值 | 含义 |
| --- | ---: | --- |
| Notice | 40% | 开始提示上下文增长 |
| Soft block | 50% | 建议停止继续堆上下文 |
| Handoff recommended | 65% | 强烈建议生成 handoff 后开新窗口 |
| High risk | 80% | 当前窗口继续工作风险较高 |

### 保留原有状态栏

安装时，ContextRisk 会包一层状态栏逻辑，同时保留你原来的状态栏输出和配置。你仍然看到原本的状态栏信息，ContextRisk 只额外记录上下文风险所需的本地状态。

如果插件更新后缓存路径变化，ContextRisk 会在新会话启动时通过 `SessionStart` 自动修复状态栏包装。通常不需要手动运行 `repair`；它只是强制刷新或排障时的兜底命令。

### 风险防护

ContextRisk 会在多个容易引发上下文爆炸的位置做保护：

| 场景 | 保护方式 |
| --- | --- |
| 用户继续发送 prompt | 在高风险时提醒或阻止继续堆上下文 |
| 大范围文件读取或命令输出 | 阻止明显过宽、容易刷屏的操作 |
| 工具批量输出过大 | 在下一次模型调用前要求停下来处理 |
| 子代理返回过大内容 | 避免超长子任务结果直接灌回主上下文 |
| 停止点和压缩点 | 记录事件，并提示是否需要 checkpoint 或 handoff |

这些保护面向使用体验和任务连续性，不要求用户理解插件内部实现。

### 结构化 handoff

当窗口上下文偏高，或者你主动希望换一个干净窗口继续时，可以生成 handoff。handoff 会聚合当前任务的核心信息：

- 当前目标
- 已完成工作
- 未完成待办
- 关键文件和项目状态
- 已验证事实与未验证假设
- 已知风险
- 推荐下一步
- 新窗口继续用的提示语

新窗口通过 handoff ID 继续时，ContextRisk 会读取项目里的 handoff 文件，核对当前目录和 git 状态，然后从可验证的信息恢复任务，而不是依赖旧窗口的长上下文记忆。

### 本地状态与隐私

ContextRisk 只写入本机和当前项目目录：

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

项目 handoff 默认应被 git 忽略，因为它们可能包含本地路径、任务状态、摘要或其他只适合本机使用的信息。分享 handoff 前请先审阅内容。

## 安装

### 从 GitHub marketplace 仓库安装

```text
/plugin marketplace add SodaZheng/context-risk
/plugin install context-risk@context-risk-marketplace
/context-risk:install
```

### 从本地 checkout 测试

```text
/plugin marketplace add /absolute/path/to/ContextRisk
/plugin install context-risk@context-risk-marketplace
/context-risk:install
```

`/context-risk:install` 会备份 `~/.claude/settings.json`，保存你原来的状态栏配置，并只更新 Claude Code 的 `statusLine.command`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `/context-risk:install` | 安装状态栏包装，启用上下文风险记录。 |
| `/context-risk:repair` | 强制刷新状态栏包装；通常不需要，主要用于排障或立即修复。 |
| `/context-risk:uninstall` | 卸载 ContextRisk 并恢复原状态栏。 |
| `/context-risk:risk-check` | 查看最近的上下文状态和风险事件。 |
| `/context-risk:handoff [objective]` | 为当前任务生成结构化 handoff。 |
| `/context-risk:continue <handoff-id>` | 在新窗口中从指定 handoff 继续。 |
| `/context-risk:compact-plan` | 生成更安全的 `/compact` 指令。 |

## 推荐工作流

1. 正常使用 Claude Code 开发、调试或分析项目。
2. 当 ContextRisk 提醒上下文风险升高时，先不要继续塞入大段信息。
3. 在当前窗口生成 handoff：

   ```text
   /context-risk:handoff Finish the current implementation safely
   ```

4. 打开同一项目下的新 Claude Code 窗口。
5. 使用 handoff ID 继续：

   ```text
   /context-risk:continue <handoff-id>
   ```

6. 新窗口会核对项目状态、复述任务上下文，并从第一项未完成待办开始继续。

## 配置

插件 manifest 暴露了 `softBlockThreshold`，默认值是 `50`。如果你希望更早或更晚触发 soft block，可以在插件配置里调整。

高级本地覆盖可以写入：

```text
~/.claude/context-risk/config.json
```

示例：

```json
{
  "thresholds": {
    "softBlock": 55
  },
  "maxToolBatchCharsBeforeBlock": 70000
}
```

建议先使用默认配置。只有当你的项目确实需要更宽松或更严格的阈值时，再调整本地覆盖。

## 更新、自动修复与卸载

更新 marketplace 后，通常只需要打开下一次 Claude Code 会话。ContextRisk 会通过 `SessionStart` hook 自动刷新状态栏包装，让它指向更新后的插件缓存路径。

只有在下面几种情况才需要手动运行 `repair`：

- 你刚更新完插件，想在当前会话里立即强制刷新。
- 自动修复没有生效，状态栏仍然指向旧插件缓存。
- `/context-risk:risk-check` 显示状态异常，需要排障。

```text
/context-risk:repair
```

卸载时先恢复状态栏，再卸载插件：

```text
/context-risk:uninstall
/plugin uninstall context-risk
```

## 排障

### 找不到插件

刷新 marketplace 后重新安装：

```text
/plugin marketplace update context-risk-marketplace
/plugin install context-risk@context-risk-marketplace
```

### hooks 有运行，但没有上下文使用率

先安装状态栏包装，再查看状态：

```text
/context-risk:install
/context-risk:risk-check
```

### 插件更新后状态栏异常

先打开一个新的 Claude Code 会话，让 `SessionStart` 自动修复运行一次。如果状态栏仍然异常，再运行：

```text
/context-risk:repair
```

### 想恢复旧状态栏

运行：

```text
/context-risk:uninstall
```

如果仍需手动检查，可以查看 `~/.claude/settings.json` 附近的备份文件。

## 开发与发布

ContextRisk 面向 marketplace 安装场景，用户不需要全局 CLI、构建产物或额外依赖。维护者在发布前应至少运行：

```bash
npm test
npm run verify
```

发布前请确认 marketplace 文件、插件 manifest、hooks 和 skills 都已提交，并在公开开源前补充 `LICENSE`。
