## ADDED Requirements

### Requirement: HiveChatAdapter 将 WS 事件映射为 assistant-ui 消息
`HiveChatAdapter` SHALL 使用 `useExternalStoreRuntime` 创建 assistant-ui runtime。

#### Scenario: 用户发送消息后创建 user + assistant message
- **WHEN** 用户通过 Composer 提交文本
- **THEN** adapter SHALL 添加 user message 和空 assistant message，设置 isRunning = true
- **THEN** adapter SHALL 调用 wsClient.request('chat.send', { prompt, threadId })

#### Scenario: agent.text-delta 事件追加文本
- **WHEN** 收到 agent.text-delta WS event
- **THEN** adapter SHALL 将增量文本追加到当前 assistant message 的 text part

#### Scenario: agent.reasoning 事件追加推理内容
- **WHEN** 收到 agent.reasoning WS event
- **THEN** adapter SHALL 将增量文本追加到当前 assistant message 的 reasoning part

#### Scenario: agent.tool-call / tool-result 事件
- **WHEN** 收到 agent.tool-call 或 agent.tool-result WS event
- **THEN** adapter SHALL 追加对应的 content part

#### Scenario: agent.complete 事件结束运行
- **WHEN** 收到 agent.complete WS event
- **THEN** adapter SHALL 设置 isRunning = false

### Requirement: ChatPage 提供对话界面
`ChatPage` SHALL 渲染对话界面，包含消息列表和输入框。

#### Scenario: 页面渲染
- **WHEN** 用户导航到 Chat 页面
- **THEN** SHALL 显示 Thread 和 Composer
- **THEN** 无消息时 SHALL 显示欢迎引导文案
