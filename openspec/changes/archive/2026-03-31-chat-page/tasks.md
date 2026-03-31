## 1. 依赖安装与项目配置

- [x] 1.1 Desktop 安装 @assistant-ui/react 依赖
- [x] 1.2 验证 assistant-ui 与 React 19 + Tailwind 4 兼容性

## 2. Server 端 chat.send handler

- [x] 2.1 admin-handler.ts 注册 chat.send handler，接收 { prompt, threadId } 参数
- [x] 2.2 chat.send 立即返回 { threadId }，异步执行 agent.chat()
- [x] 2.3 Agent 未初始化时返回 AGENT_NOT_READY 错误，空 prompt 返回 VALIDATION 错误
- [x] 2.4 实现 toolCallId 生成与传递机制

## 3. Server 端 Agent 流式事件推送

- [x] 3.1 注入 onReasoning 回调，broadcast agent.reasoning event
- [x] 3.2 注入 onText 回调，broadcast agent.text-delta event
- [x] 3.3 注入 onToolCall 回调，broadcast agent.tool-call event
- [x] 3.4 注入 onToolResult 回调，broadcast agent.tool-result event
- [x] 3.5 Agent 执行完成后 broadcast agent.complete event

## 4. Desktop 端 ChatPage UI

- [x] 4.1 创建 ChatPage 组件，渲染 Thread + Composer
- [x] 4.2 实现 WS event 监听与消息追加
- [x] 4.3 实现 WS 断连容错处理
- [x] 4.4 Dashboard 侧边栏新增 Chat 导航项
- [x] 4.5 空消息状态显示欢迎引导文案
- [x] 4.6 Tailwind 样式适配 Hive stone 色系

## 5. 测试

- [x] 5.1 Server 单元测试：chat.send handler 参数校验
- [x] 5.2 Server 单元测试：Agent 流式事件广播正确性
- [ ] 5.3 手动 E2E 验证
