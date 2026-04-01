## ADDED Requirements

### Requirement: Integration test shared infrastructure
系统 SHALL 提供 `tests/integration/integration-helpers.ts` 共享模块，包含：
- 智能 AI SDK mock 工厂函数（支持纯文本响应、工具调用响应、多轮对话响应序列）
- Agent 生命周期管理（`createTestAgent` / `withAgent` 自动 initialize + dispose）
- 场景预设函数（`setupSimpleChat` / `setupToolUseChat` / `setupMultiTurnChat`）
- 断言增强函数（`assertToolCalled` / `assertHookFired` / `assertSessionSaved`）

#### Scenario: Create smart mock with text-only response
- **WHEN** 调用 `createMockAI([{ text: 'Hello' }])`
- **THEN** 返回的 `mockGenerateText` 解析为 `{ text: 'Hello', steps: [], finishReason: 'stop' }`

#### Scenario: Create smart mock with tool call response
- **WHEN** 调用 `createMockAI([{ toolCalls: [{ toolName: 'file', args: { action: 'read', path: '/test.ts' } }] }])`
- **THEN** 返回的 mock 解析为包含 toolCalls 的 steps，finishReason 为 'tool-calls'

#### Scenario: Create smart mock with multi-turn sequence
- **WHEN** 调用 `createMockAI([response1, response2])`
- **THEN** 第一次调用返回 response1，第二次调用返回 response2

#### Scenario: withAgent auto cleanup
- **WHEN** 使用 `withAgent(async (agent) => { throw new Error('test') })`
- **THEN** Agent.dispose() 仍然被调用，不泄露资源

### Requirement: SDK public API contract tests
系统 SHALL 验证 `packages/core/src/index.ts` 导出的所有公开 API 符合消费者契约。

#### Scenario: All named exports exist
- **WHEN** import from `@bundy-lmw/hive-core`
- **THEN** `Agent`, `createAgent`, `getAgent`, `ask`, `explore`, `plan`, `general`, `runWorkflow` 等核心导出存在且类型正确

#### Scenario: Agent constructor accepts minimal config
- **WHEN** 调用 `new Agent()` 或 `createAgent()`
- **THEN** Agent 实例成功创建，`initialize()` 后可使用

#### Scenario: Agent has all public methods
- **WHEN** Agent 实例创建并初始化后
- **THEN** `chat`, `explore`, `plan`, `general`, `runWorkflow`, `dispatch`, `listProviders`, `useProvider`, `listSkills`, `createSession`, `loadSession`, `listSessions` 等方法存在

#### Scenario: Convenience functions work
- **WHEN** 调用 `ask('hello')` 或 `explore('find files')` 等便捷函数
- **THEN** 函数可调用不抛异常（mock 环境下）

### Requirement: Full conversation chain integration tests
系统 SHALL 验证 "用户输入 → LLM 响应 → 工具调用 → 返回结果" 的完整链路。

#### Scenario: Simple text chat
- **WHEN** 用户调用 `agent.chat('你好')`，mock LLM 返回纯文本
- **THEN** Agent 返回 LLM 的文本响应，session 中记录 user + assistant 消息

#### Scenario: Chat with tool use
- **WHEN** 用户调用 `agent.chat('读取 /tmp/test.ts')`，mock LLM 返回工具调用请求
- **THEN** Agent 执行工具调用，将工具结果发回 LLM，返回最终响应

#### Scenario: Multi-turn conversation context
- **WHEN** 用户连续调用 `agent.chat()` 两次
- **THEN** 第二次调用时 LLM 收到包含第一次对话历史的 messages 数组

#### Scenario: Tool execution hooks fire
- **WHEN** Agent 在 chat 中执行工具调用
- **THEN** `tool:before` 和 `tool:after` hook 被触发，hook context 包含 toolName 和 args

#### Scenario: Session auto-created on chat
- **WHEN** 用户首次调用 `agent.chat()`
- **THEN** session 自动创建，`agent.currentSession` 不为 null

### Requirement: Sub-agent collaboration integration tests
系统 SHALL 验证 Explore / Plan / General 三种子 Agent 的独立运行和工具权限隔离。

#### Scenario: Explore agent runs with read-only tools
- **WHEN** 调用 `agent.explore('find all TypeScript files')`
- **THEN** Explore agent 被调用，使用只读工具（file/glob/grep/web），不使用 bash

#### Scenario: Plan agent runs with read-only tools
- **WHEN** 调用 `agent.plan('design auth system')`
- **THEN** Plan agent 被调用，使用只读工具

#### Scenario: General agent runs with full tools
- **WHEN** 调用 `agent.general('create a new file')`
- **THEN** General agent 被调用，可使用所有工具包括 bash

#### Scenario: Sub-agent result returns to parent
- **WHEN** 子 Agent 执行完成
- **THEN** 结果文本返回给调用方

### Requirement: Workflow engine integration tests
系统 SHALL 验证 WorkflowCapability 的自主循环执行能力。

#### Scenario: Basic workflow execution
- **WHEN** 调用 `agent.runWorkflow({ task: 'test task' })`
- **THEN** Workflow 启动，经历 explore/plan/execute 阶段，返回 WorkflowResult

#### Scenario: Workflow phase hooks fire
- **WHEN** Workflow 执行过程中
- **THEN** `workflow:phase` hook 被触发，context 包含 phase 名称

#### Scenario: Workflow tool calls execute
- **WHEN** Workflow 中 Agent 决定调用工具
- **THEN** 工具被实际执行（在 mock 环境下验证工具调用链路）

#### Scenario: Workflow maxTurns limit
- **WHEN** 设置 `maxTurns: 2`
- **THEN** Workflow 最多执行 2 轮后停止

### Requirement: Custom provider integration tests
系统 SHALL 验证用户自定义 Provider 的注册、切换和使用。

#### Scenario: Register and use custom provider
- **WHEN** 用户通过 `agent.useProvider()` 切换到自定义 Provider
- **THEN** 后续 `agent.chat()` 使用该 Provider 进行 LLM 调用

#### Scenario: Provider switching changes behavior
- **WHEN** 从 Provider A 切换到 Provider B 后调用 chat
- **THEN** LLM 调用使用 Provider B 的配置（baseURL、apiKey、model）

#### Scenario: Multiple agents provider isolation
- **WHEN** 创建两个 Agent 实例，分别使用不同 Provider
- **THEN** 两个 Agent 的 Provider 配置互不影响

#### Scenario: Non-existent provider returns false
- **WHEN** 调用 `agent.useProvider('non-existent')`
- **THEN** 返回 false，Agent 仍使用当前 Provider

### Requirement: Session resume integration tests
系统 SHALL 验证会话持久化 → 恢复 → 继续对话的完整链路。

#### Scenario: Chat auto-persists session
- **WHEN** 用户调用 `agent.chat('hello')`
- **THEN** session 被持久化到 SQLite，包含 user 和 assistant 消息

#### Scenario: Load session and continue chat
- **WHEN** 加载已保存的 session 后继续 chat
- **THEN** Agent 上下文包含历史消息，LLM 收到完整对话历史

#### Scenario: List sessions
- **WHEN** 调用 `agent.listSessions()`
- **THEN** 返回历史 session 列表，按更新时间倒序

#### Scenario: Resume last session
- **WHEN** 调用 `agent.resumeLastSession()`
- **THEN** 加载最近的 session，后续 chat 在该 session 上下文中继续

### Requirement: Schedule end-to-end integration tests
系统 SHALL 验证定时任务的创建、管理和触发执行。

#### Scenario: Create schedule via natural language
- **WHEN** Agent 收到包含定时意图的消息（如"每天早上9点提醒我"）
- **THEN** ScheduleCapability 解析意图，创建 Schedule 对象

#### Scenario: List schedules
- **WHEN** 调用 schedule 列表接口
- **THEN** 返回所有活跃的定时任务

#### Scenario: Schedule execution triggers
- **WHEN** 定时任务的触发时间到达
- **THEN** 对应的 prompt 被执行（chat/workflow/dispatch）

#### Scenario: Delete schedule
- **WHEN** 删除一个定时任务
- **THEN** 该任务不再出现在列表中，不再触发

#### Scenario: Invalid cron expression rejected
- **WHEN** 创建包含无效 cron 表达式的定时任务
- **THEN** 创建失败，返回验证错误

### Requirement: Enhanced mock quality for existing tests
现有 5 个集成测试文件 SHALL 使用 `integration-helpers.ts` 提供的智能 mock，增加行为验证用例。

#### Scenario: agent-hooks.test.ts tool hooks actually fire
- **WHEN** Agent 执行包含工具调用的 chat
- **THEN** `tool:before` hook 的 spy 被调用，参数包含正确的 toolName 和 args

#### Scenario: agent-provider.test.ts switching affects chat
- **WHEN** 切换 Provider 后调用 chat
- **THEN** mock 的 generateText 收到新 Provider 的 model 配置

#### Scenario: agent-skill.test.ts skill matched in chat
- **WHEN** Agent chat 输入匹配某个已注册技能
- **THEN** 技能的 system prompt 被包含在 LLM 请求中

#### Scenario: session-compression.test.ts compression triggers on threshold
- **WHEN** session 消息 token 数超过压缩阈值
- **THEN** 压缩策略被触发，消息被压缩
