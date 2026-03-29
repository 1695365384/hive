## Context

Agent 通过 `dispatch(content, options)` 处理用户请求，返回 `DispatchResult { text, success, ... }`。ServerImpl 取 `result.text` 通过 `message:response` 发送到 channel。整个管道只支持纯文本。

现有工具采用"回调注入"模式（见 `ask-user-tool`）：工具模块暴露全局 setter，Server 在启动时注入回调。`send_file` 工具采用相同模式。

工具的白名单机制在 `ToolRegistry.AGENT_TOOL_WHITELIST` 中定义，`send_file` 仅分配给 `general` Agent（需要发送能力）。

## Goals / Non-Goals

**Goals:**
- Agent 能主动将本地文件发送给当前会话用户
- `ChannelSendOptions` 有类型安全的 `filePath` 字段
- 回调注入机制与 `ask-user` 保持一致

**Non-Goals:**
- 不改 `DispatchResult` 结构（result.text 仍是纯文本，文件发送走工具独立通道）
- 不做文件接收方向的工具化（接收已在飞书插件内部自动处理）
- 不做批量发送、进度反馈等高级功能

## Decisions

### D1: 工具调用直接走 channel.send()，不走 messageBus

**选择**: `send_file` 工具通过回调拿到 channel 实例，直接调用 `channel.send()`。

**备选**: 通过 `message:response` 走 messageBus → ServerImpl 路由。

**理由**: 工具在 Agent dispatch 执行过程中被调用，此时会话上下文（channelId, chatId）已知。直接调 channel 减少一层间接，且 `send_file` 的返回值（成功/失败）能立即反馈给 Agent。

```
send_file 工具
  → callback(channelId, chatId)
  → channelContext.get(channelId)
  → channel.send({ to: chatId, type: 'file', filePath })
  → return "文件已发送: report.pdf"
```

### D2: 回调注入方式

**选择**: `ToolRegistry.setSendFileCallback(cb)` 注入，与 `setAskUserCallback` 一致。

```typescript
type SendFileCallback = (filePath: string) => Promise<{ success: boolean; error?: string }>;
```

Server 在初始化时注入：从当前 dispatch 的 channelId + chatId 构建闭包，闭包内调用 `channelContext.get(channelId).send()`。

### D3: filePath 提升为 ChannelSendOptions 一等字段

**选择**: `ChannelSendOptions.filePath?: string`

**理由**: `metadata` 是 `Record<string, unknown>`，类型不安全。`filePath` 是核心字段，应与 `content`、`type` 同级。

### D4: 工具分配给 general Agent

`send_file` 只给 `general` Agent，因为 `explore`/`plan` 是只读 Agent，不应有发送能力。

## Risks / Trade-offs

- **回调闭包捕获 channelId/chatId 的时机** — 需要在每次 dispatch 时更新闭包。Mitigation: 在 `subscribeMessageHandler` 的每次 dispatch 调用前设置回调
- **文件不存在** — 工具 execute 内检查 `fs.existsSync`，返回友好错误
- **channel 不支持文件发送** — 检查 `channel.capabilities.sendFile`，不支持时返回提示
