## Why

Desktop 端目前只有 Status / Config / Plugins 三个页面，缺少与 Agent 直接对话的入口。需要构建一个对话页面，让用户在桌面端直接与 Hive Agent 实时交流，查看思考过程、工具调用和流式回复。

## What Changes

- 新增 Desktop **Chat 页面**，集成 `@assistant-ui/react` 组件库
- 新增 **Hive Chat Adapter**：将 Hive WS 事件协议映射到 assistant-ui 的消息模型
- 新增 Server 端 **chat.send** WS handler：触发 Agent 执行并流式推送事件
- 新增 Server 端 **agent.\*** 系列 WS event：agent.start / reasoning / text-delta / tool-call / tool-result / complete
- Dashboard 侧边栏新增 Chat 导航项

## Capabilities

### New Capabilities
- `agent-chat-ui`: Desktop 端 Agent 对话 UI，支持流式文本、推理展示、工具调用可视化
- `agent-chat-protocol`: Server 端 Agent 对话 WS 协议，定义 chat.send 请求和 agent.* 事件流

### Modified Capabilities
- `server-factory`: 新增 chat.send handler 注册和 Agent 流式事件广播能力

## Impact

- **Desktop**: 新增 ChatPage、HiveChatAdapter、HiveChatProvider
- **Server**: admin-handler.ts 新增 chat.send handler
- **API**: 新增 WS 方法 chat.send，新增 6 个 WS event 类型
- **依赖**: Desktop 新增 @assistant-ui/react npm 包
