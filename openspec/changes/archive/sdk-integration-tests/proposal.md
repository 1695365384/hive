## Why

core 包当前有 23 个单元测试和 7 个集成测试，但集成测试覆盖面不足：缺少 SDK 公开 API 契约验证、完整对话链路（输入→LLM→工具→响应）、子 Agent 协作、工作流引擎、自定义 Provider 接入、会话恢复续聊、定时任务端到端等关键场景。同时现有集成测试的 AI SDK mock 过于简单（固定文本返回、空 steps），导致大量测试只能验证"能注册/能调用"而无法验证"正确触发/正确行为"。

## What Changes

- 新建 `tests/integration/integration-helpers.ts`：共享的集成测试基础设施，提供智能 AI SDK mock 工厂、Agent 生命周期管理、场景预设、断言增强
- 新增 7 个集成测试文件：`sdk-contract`、`full-conversation`、`sub-agent`、`workflow`、`custom-provider`、`session-resume`、`schedule-e2e`
- 提升现有 5 个集成测试文件的 mock 质量：`agent-flow`、`agent-hooks`、`agent-provider`、`agent-skill`、`session-compression`（`sqlite-persistence` 和 `tool-system` 已用真实依赖，质量好，不动）
- 扩展 `tests/utils/test-helpers.ts`：增加流式响应 mock、工具调用 mock 等通用工具函数

## Capabilities

### New Capabilities
- `sdk-integration-tests`: core 包 SDK 集成测试套件，覆盖公开 API 契约、完整对话链路、子 Agent 协作、工作流引擎、自定义 Provider、会话恢复、定时任务端到端

### Modified Capabilities
- `tool-registry`: 集成测试需要更丰富的工具调用 mock（toolCalls + tool results 链路）
- `capability-lifecycle`: 集成测试验证 Agent 生命周期中 capability 初始化/清理的正确性

## Impact

- **影响范围**: 仅 `packages/core/tests/`，不影响生产代码
- **依赖**: 无新依赖，复用现有 vitest + better-sqlite3
- **配置**: 可能需要调整 `vitest.config.ts` 的 coverage exclude（排除 helpers）

## Non-goals

- 不修改生产代码（仅测试代码变更）
- 不新增 E2E 测试（已有 `agent-real.test.ts` / `provider-real.test.ts`，集成测试用 mock LLM）
- 不修改 `setup.ts` 全局 mock（unit 测试依赖它，保持稳定）
- 不追求 100% 覆盖率（目标：集成测试覆盖所有关键链路，具体覆盖率由后续 coverage 阶段处理）
- 不做性能/压力测试
