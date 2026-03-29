## Why

当前 Hive 的 LLM 调用层完全依赖 `@anthropic-ai/claude-agent-sdk`。这个 SDK 提供了强大的 agentic loop 和子 Agent 委托，但存在三个根本性问题：

1. **Provider 锁定**：`query()` 函数通过 `ANTHROPIC_*` 环境变量配置，无论用户选择什么 Provider（DeepSeek、GLM、Qwen），底层都走 Anthropic 协议。项目已有的 `ProviderManager` + `ProviderAdapter` + `LanguageModelV3` 体系形同虚设——它能创建任意 Provider 的模型实例，但没有消费者。
2. **双重调度冲突**：Hive 已有 `Dispatcher` + `Classifier` 做代码级任务路由，但 `query()` 内部的 Claude 会自主决定调用 `Task` tool 启动子 Agent，两层调度互相干扰。
3. **消息格式锁定**：`SdkMessage`（`ResultMessage`、`AssistantMessage`、`ToolProgressMessage`）完全对齐 Claude 私有格式，阻碍了多 Provider 适配。

Vercel AI SDK（`ai`）已经提供了等价的 agentic loop（`maxSteps`）、多 Provider 原生支持（`@ai-sdk/*`）、更丰富的事件流（`fullStream` 18+ 事件类型），且项目已经安装了这些依赖。是时候用 AI SDK 替换 claude-agent-sdk，同时合并冗余的执行层。

## What Changes

- 新增 `LLMRuntime`：统一的 LLM 执行引擎，内部调用 AI SDK 的 `generateText()` / `streamText()`
- 删除 `ChatCapability`、`SubAgentCapability`、`AgentRunner`，由 `LLMRuntime` 统一替代
- `Agent` 类直接持有 `LLMRuntime`，删除能力层间接调用
- 消息类型系统从 Claude 私有 `SdkMessage` 迁移到 AI SDK 原生事件类型
- 删除 `@anthropic-ai/claude-agent-sdk` 依赖
- `memory-tools.ts` 中的 `createSdkMcpServer` 替换为 AI SDK `tool()` 定义

## Capabilities

### New Capabilities
- `unified-llm-runtime`: 统一执行引擎，支持任意 Provider + 流式/非流式 + hooks 集成

### Modified Capabilities
- `chat`: 从独立 Capability 简化为 Agent 上的便捷方法，底层委托 `LLMRuntime`
- `sub-agent`: 删除 SubAgentCapability，explore/plan/general 改为 `LLMRuntime.run()` 的配置差异
- `dispatch`: `llm-utils.ts` 中的分类器从 claude-agent-sdk `query()` 迁移到 AI SDK `generateText()`

## Impact

- **删除文件**: `ChatCapability.ts`, `SubAgentCapability.ts`, `runner.ts`, `agents.ts`（BUILTIN_AGENTS 定义合并到 runtime）
- **新增文件**: `src/agents/runtime/LLMRuntime.ts`, `src/agents/runtime/types.ts`, `src/agents/runtime/index.ts`
- **修改文件**: `Agent.ts`（持有 LLMRuntime，删除 capability 间接层）, `llm-utils.ts`（分类器迁移）, `memory-tools.ts`（MCP 工具迁移）, 类型文件（删除 SdkMessage 相关类型）
- **依赖变更**: 删除 `@anthropic-ai/claude-agent-sdk`，升级 `ai` / `@ai-sdk/*`（已有依赖）
- **测试**: 重写所有 mock（从 `vi.mock('claude-agent-sdk')` 改为 mock AI SDK），更新单元/集成测试
- **API 兼容**: `Agent.chat()`, `Agent.explore()`, `Agent.plan()`, `Agent.general()`, `Agent.dispatch()` 签名不变，内部实现替换
- **向后兼容**: Provider 配置格式不变，外部应用无需修改
