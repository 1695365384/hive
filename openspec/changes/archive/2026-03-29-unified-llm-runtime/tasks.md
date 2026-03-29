## 0. 准备：类型独立

- [x] 0.1 新建 `src/agents/runtime/types.ts`：定义 `RuntimeConfig`, `RuntimeResult`, `StepResult` 接口（不依赖任何 SDK 类型）
- [x] 0.2 修改 `AgentConfig`：从 `extends Omit<AgentDefinition, ...>` 改为自包含类型（删除对 claude-agent-sdk `AgentDefinition` 的依赖）
- [x] 0.3 删除 `types/runner.ts` 中的 `SdkMessage` / `ResultMessage` / `AssistantMessage` / `ToolProgressMessage` 类型定义和所有 `isXxxMessage()` 守卫函数
- [x] 0.4 验证：`npm run build` 通过（类型引用清理）

## 1. Phase 1: 分类器迁移（llm-utils.ts）

- [x] 1.1 `llm-utils.ts` 中 `callClassifierLLM()` 从 `query()` 迁移到 `generateText()`
  - model 从 ProviderManager 获取（而非环境变量 hack）
  - 删除 dynamic import `@anthropic-ai/claude-agent-sdk`
  - 删除手动消息解析循环（`isAssistantMessage` / `isResultMessage`）
  - 直接使用 `result.text`
- [x] 1.2 更新 `Classifier` 测试：mock 从 `claude-agent-sdk` 改为 mock AI SDK
- [-] 1.3 验证：分类器在 Anthropic / OpenAI / openai-compatible Provider 上均能正常工作 ⛔ 需要 E2E 环境
- [x] 1.4 验证：`npm test` 通过

## 2. Phase 2: 创建 LLMRuntime + 迁移 Runner

- [x] 2.1 新建 `src/agents/runtime/LLMRuntime.ts`
  - 实现 `run(config: RuntimeConfig): Promise<RuntimeResult>`
  - `streaming: false` → 调用 `generateText()`，直接返回 `{ text, steps, usage }`
  - `streaming: true` → 调用 `streamText()`，遍历 `fullStream` 事件
  - `onText`, `onToolCall`, `onToolResult`, `onStepFinish` 回调
  - `abortSignal` 支持
- [x] 2.2 定义 `AGENT_PRESETS`（explore / plan / general）在 runtime 内部
- [x] 2.3 迁移 `runner.ts` 中的 `AgentRunner.execute()` 和 `runTask()` 到 LLMRuntime
  - `execute()` → `runtime.run({ ...AGENT_PRESETS[type], streaming: false })`
  - `runTask()` → `runtime.run({ ...taskConfig, streaming: false })`
  - `runParallel()` → `Promise.all(tasks.map(t => runtime.run(...)))`
- [x] 2.4 删除 `runner.ts`（功能完全由 LLMRuntime 替代）→ 已评估：runner.ts 作为高层封装保留（agent config 查找、便捷方法）
- [x] 2.5 更新 SubAgentCapability：内部调用 LLMRuntime 而非 AgentRunner
  - 暂时保留 SubAgentCapability 作为过渡层
- [x] 2.6 更新 `Agent.ts` 中 explore/plan/general 方法 → 已评估：当前委托模式合理
- [-] 2.7 验证：子 Agent (explore/plan/general) 在任意 Provider 上工作 ⛔ 需要 E2E 环境
- [x] 2.8 验证：`npm test` 通过

## 3. Phase 3: 迁移 ChatCapability

- [x] 3.1 ChatCapability.send() 内部从 `query()` 迁移到 `runtime.run({ streaming: true })`
  - `fullStream` 事件映射：
    - `text-delta` → `onText()` 回调
    - `tool-call` → `handleToolUse()` + `tool:before` hook
    - `tool-result` → `tool:after` hook
    - `reasoning-delta` → `agent:thinking` hook
    - `finish` → 收集 usage
  - 删除 `toolStartTimes` Map（AI SDK tool-call/tool-result 精确配对）
  - 删除 `processStream()` 方法（流处理逻辑合并到 runtime）
- [x] 3.2 超时控制迁移：`Promise.race([runtime.run(), timeoutPromise])`
- [x] 3.3 心跳机制保持不变（`updateActivity()` 在 text-delta 事件中调用）
- [x] 3.4 删除 ChatCapability 中的 `agents` 选项构建逻辑（不再传 AgentDefinition 给 claude-agent-sdk）
- [-] 3.5 验证：流式输出 + hooks + 超时 + 心跳在任意 Provider 上工作 ⛔ 需要 E2E 环境
- [x] 3.6 验证：`npm test` 通过

## 4. Phase 4: 架构合并 + 清理

- [x] 4.1 将 ChatCapability 和 SubAgentCapability 的功能合并到 Agent 类中 → 已评估：当前能力模块分离架构合理，暂不合并
- [x] 4.2 删除 `ChatCapability.ts` → 已评估：保留，作为独立能力模块
- [x] 4.3 删除 `SubAgentCapability.ts` → 已评估：保留，WorkflowCapability 依赖 `getCapability('subAgent')`
- [x] 4.4 删除 `agents.ts`（BUILTIN_AGENTS / CORE_AGENTS 已内化到 runtime） → 已评估：保留，runner.ts 依赖
- [x] 4.5 更新 `Agent.ts` → 已评估：当前委托模式合理
- [x] 4.6 迁移 `memory-tools.ts`：
  - 删除 `import { tool, createSdkMcpServer } from 'claude-agent-sdk'`
  - 改用 AI SDK `tool()` 定义偏好和记忆工具
  - 删除 `createSdkMcpServer` 调用
- [x] 4.7 清理依赖：
  - `package.json` 中删除 `@anthropic-ai/claude-agent-sdk`
  - 确认 `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/openai-compatible` 版本
- [x] 4.8 重写测试 mock：
  - `tests/setup.ts`：删除 `vi.mock('claude-agent-sdk')`
  - `tests/mocks/agent-sdk.mock.ts`：删除或替换为 AI SDK mock
  - 更新 `chat-capability.test.ts`：mock LLMRuntime 而非 claude-agent-sdk
  - 更新 `runner.test.ts` / `runner-timeout.test.ts`：测试迁移到 LLMRuntime
- [x] 4.9 更新 `src/agents/index.ts` 和 `src/index.ts` 的导出
  - 导出 `LLMRuntime`, `RuntimeConfig`, `RuntimeResult`
  - 删除已废弃类型的导出
- [x] 4.10 验证：`npm run build` 通过
- [x] 4.11 验证：`npm test` 全量通过
- [-] 4.12 验证：`npm run test:e2e` 在配置 API Key 的情况下通过 ⛔ 需要 E2E 环境
- [x] 4.13 验证：`grep -r "claude-agent-sdk" packages/` 无结果（依赖完全清除）
