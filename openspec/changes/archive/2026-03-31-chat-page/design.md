## Context

Hive Desktop 是 Tauri + React 19 + Tailwind 4 SPA，通过 WebSocket 与 Hive Server 通信。当前缺少与 Agent 对话的入口。Server 端 LLMRuntime 已支持 fullStream 流式事件。

## Goals / Non-Goals

**Goals:**
- Desktop 端提供 Chat 页面，用户可直接与 Agent 对话
- 展示 Agent 思考过程、工具调用、流式文本回复
- Server 端通过 WS event 实时推送 Agent 执行过程

**Non-Goals:**
- 不做会话历史持久化、多轮上下文、文件上传、Agent 类型选择

## Decisions

### Decision 1: 使用 `useExternalStoreRuntime`
Hive 用 WS 事件驱动通信，`useExternalStoreRuntime` 让我们完全控制 messages 状态，与 WS 模式天然契合。

### Decision 2: chat.send fire-and-forget
立即返回 `{ threadId }`，通过 WS event 推送执行过程，避免 30s 超时。

### Decision 3: 消息映射
```
agent.reasoning  → { type: 'reasoning', text }
agent.text-delta → { type: 'text', text }
agent.tool-call  → { type: 'tool-call', toolCallId, toolName, args }
agent.tool-result → (通过 toolCallId 关联)
```

## Risks / Trade-offs

- **WS 断连消息丢失** → adapter 将当前 message 标记为 interrupted
- **单轮对话限制** → chat.send 支持 sessionId 参数，后续迭代启用
