## Why

README 将 Hive 定位为 OpenClaw 替代品，列出了 8 大痛点对应的解决方案。经代码审查，其中 6 个痛点存在"README 说了但代码没完全做到"的差距。这些差距直接影响用户首次体验和信任度——用户照着 README 试用后如果发现声称的功能不存在，会比没有这个功能更糟。需要在新用户接触到项目之前补齐这些差距。

排除范围：
- npm 包发布（运营问题，不是代码问题）
- 多 Agent 编排引擎的 DAG/并行能力（当前三阶段管道已足够，orchestrator 包后续迭代）
- 更新稳定性（需要时间验证，不是当前可解决的）

## What Changes

- **新增成本追踪能力**：在 dispatch/workflow 层收集真实 token 用量，按阶段和模型计算费用，在 DispatchResult 中返回成本摘要。用户能看到"这个任务花了 $0.03"。
- **增强权限执行**：将 agents.ts 中定义的只读工具列表从 prompt 级建议升级为 SDK `tools` 参数级硬限制，确保 explore/plan 阶段无法调用写入工具。
- **新增 Trace 持久化**：将 DispatchTraceEvent 写入 Session 存储（SQLite），支持事后审计和调试。
- **新增 ERNIE 提供商预设**：在 BUILTIN_PRESETS 中补充百度文心一言的环境变量检测和默认配置。
- **新增国产模型参数适配**：在 openai-compatible 适配器中为已知国产模型添加参数预处理（如剥离不支持的 reasoning_effort、适配 stream 格式）。
- **Workflow 自动压缩**：在 workflow 各阶段之间自动调用 CompressionService，防止长任务上下文膨胀。

## Capabilities

### New Capabilities
- `cost-tracking`: Token 用量收集和成本估算，覆盖 dispatch 和 workflow 两个入口
- `trace-persistence`: DispatchTraceEvent 的持久化存储和查询
- `ernie-provider`: 百度文心一言提供商预设

### Modified Capabilities
- `unified-execution-engine`: 权限从 prompt 级升级为 tools 参数级硬限制；workflow 阶段间自动触发压缩
- `env-fallback`: 新增 ERNIE 环境变量检测；国产模型参数适配逻辑

## Impact

- **packages/core/src/providers/sources/env.ts**: 新增 ERNIE 预设，新增参数适配
- **packages/core/src/providers/adapters/openai-compatible.ts**: 新增参数预处理
- **packages/core/src/agents/core/agents.ts**: CORE_AGENTS tools 定义保持不变（已是只读列表），但 runner 层需硬限制
- **packages/core/src/agents/core/runner.ts**: execute() 需接受 tools 白名单参数，传递给 SDK
- **packages/core/src/agents/capabilities/WorkflowCapability.ts**: 阶段间插入压缩调用；收集各阶段 usage
- **packages/core/src/agents/dispatch/Dispatcher.ts**: 收集总 usage，计算成本
- **packages/core/src/agents/dispatch/types.ts**: DispatchResult 新增 cost 字段
- **packages/core/src/session/**: Trace 事件写入 Session 存储
- **packages/core/src/compression/**: 无变更，复用现有 CompressionService
- **依赖**: 无新依赖，全部基于现有代码增强
