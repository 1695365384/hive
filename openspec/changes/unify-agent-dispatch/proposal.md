## Why

Agent.ts 对外暴露了 7 个任务执行入口（chat/explore/plan/general/runSubAgent/runWorkflow/dispatch），实际做的是同一件事——给 LLM 一个任务拿回结果。Server 端只用 `chat()`，CLI 用另外 4 个，`dispatch()` 和 `runSubAgent()` 无人调用。ChatCapability、WorkflowCapability、SubAgentCapability 三个 Capability 各自构建 system prompt、各管各的工具集、各走各的 hook，逻辑大量重复且互相不一致。子 Agent 已实现为 AI SDK Tool 格式，让 LLM 自主决定何时调用即可，无需暴露为公共 API。再不收敛，每加一个执行场景都要同时改 3 个 Capability，维护成本持续增长。

## What Changes

- **BREAKING** 删除 `ChatCapability`、`WorkflowCapability`、`SubAgentCapability` 三个 Capability 类
- **BREAKING** 删除 `Dispatcher` 类
- 新建 `ExecutionCapability`：统一的任务执行引擎，合并三者核心逻辑
- **BREAKING** `Agent.chat()` 变为 `Agent.dispatch()` 的向后兼容别名
- **BREAKING** `Agent.explore()`、`Agent.plan()`、`Agent.general()`、`Agent.runSubAgent()`、`Agent.runWorkflow()` 全部删除，由 `dispatch({ forceMode })` 替代
- 所有执行路径统一使用 `streamText` + 全量工具 + subagent tools
- CLI 的强制角色模式通过 `forceMode` 参数 + prompt 约束实现，不走不同执行路径
- `subagent-tools.ts` 的工具创建逻辑内联到 ExecutionCapability

## Capabilities

### New Capabilities
- `task-dispatch`: 统一的任务分发与执行能力，替代 ChatCapability + WorkflowCapability + SubAgentCapability

### Modified Capabilities
<!-- 无现有 spec 需要修改，这是纯内部重构 -->

## Non-goals

- 不改变 LLM 调用方式（仍用 AI SDK streamText）
- 不改变工具注册机制（ToolRegistry 不动）
- 不改变 hooks 系统（workflow:phase/tool:before/after 仍保留）
- 不改变 Provider/Skill/Session/Timeout/Schedule 等无关 Capability
- 不改变 subagent tool 的 AI SDK Tool 格式
- 不改变 Server 端 WebSocket 协议和前端接口
- 不改变 CLI 的用户交互方式（CLI 仍支持 explore/plan/general/chat/workflow 模式）

## Impact

- **packages/core**: Agent.ts、Capability 注册、类型定义、导出
- **apps/server**: chat-handler.ts 中 `agent.chat()` → `agent.dispatch()`（改动极小，回调接口不变）
- **CLI**: cli.ts 中 4 个执行函数统一为 `agent.dispatch()`
- **测试**: ChatCapability/WorkflowCapability/SubAgentCapability 的测试迁移到 ExecutionCapability
