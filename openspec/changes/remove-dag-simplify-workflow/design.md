## Context

当前 Hive 的执行层分为四级：chat (L1) → swarm (L2) → pipeline (L3) → workflow (L4)。其中 swarm/pipeline 是基于 DAG 的多 Agent 编排系统，包含拓扑排序、共享黑板、模板匹配、结果聚合等机制，总计约 2000 行代码。

经过分析，所有内置模板（10 个，覆盖 add-feature/debug/code-review/refactor）都是简单的链式或扇出结构，没有真正的菱形依赖。DAG 编排的复杂度与实际使用场景不匹配。

当前 WorkflowCapability.run() 已经被简化为"单次 runner.execute('general')"，失去了 explore/plan 能力。SubAgentCapability 提供了 explore/plan/general 三子 Agent 的独立调用能力，但没有被 workflow 使用。

## Goals / Non-Goals

**Goals:**
- 删除 DAG 编排系统（swarm/ + pipeline/），降低系统复杂度
- 增强 WorkflowCapability 为 explore → plan → execute 三阶段顺序执行
- 简化 Dispatcher 分类为 chat / workflow 二选一
- 清理所有相关的类型、测试、API 端点

**Non-Goals:**
- 不引入 Agent Loop（act → reflect → act 循环）—— 可作为后续改进
- 不改变 SubAgentCapability 的实现
- 不改变 AgentRunner 的实现
- 不改变 ChatCapability 的实现
- 不改变 hooks 系统

## Decisions

### Decision 1: 三子 Agent 顺序执行替代 DAG

**选择**: WorkflowCapability 内部按 explore → plan → general 顺序调用 SubAgentCapability，上下文通过 prompt 拼接传递。

**替代方案**:
- A: Agent Loop（act → reflect 循环）—— 更灵活但变更更大，留作后续
- B: 保留 DAG 但简化为"阶段列表"—— 保留了不必要的抽象层

**理由**: 三子 Agent 模式已被验证（SubAgentCapability 已实现），顺序执行覆盖绝大多数场景，实现简单（~50 行改动），上下文传递通过 prompt 拼接即可。

### Decision 2: WorkflowCapability 直接使用 SubAgentCapability

**选择**: WorkflowCapability 通过 `this.context.getCapability('subAgent')` 获取 SubAgentCapability 实例，调用其 explore/plan/general 方法。

**理由**: SubAgentCapability 已封装了 hooks（agent:spawn / agent:complete）和 runner 调用，无需重复实现。WorkflowCapability 专注于阶段编排和会话管理。

### Decision 3: Dispatcher 简化为 chat / workflow 二分类

**选择**: ExecutionLayer 从 `chat | swarm | pipeline | workflow` 简化为 `chat | workflow`。删除 `forceLayer: 'swarm' | 'pipeline'` 支持。

**替代方案**: 保留 swarm 层但改为调用 workflow —— 增加不必要的间接层。

**理由**: 删除后分类器只需区分"简单对话"和"复杂任务"，正则 fallback 也更简单。

### Decision 4: Workflow 内部决定是否需要 explore/plan

**选择**: analyzeTask() 增强判断逻辑：
- simple（短问答）→ 直接 runner.execute('general')，跳过 explore/plan
- moderate/complex → explore → plan → execute 完整流程

**理由**: 简单任务不需要探索和规划，直接执行更高效。

### Decision 5: 先删除后增强，分阶段实施

**选择**: 实施顺序为：① 删除 swarm/pipeline 代码 ② 简化 Dispatcher ③ 增强 WorkflowCapability ④ 清理测试和 API。

**理由**: 先删除依赖关系，再增强 workflow，避免在过渡态引入冲突。

## Risks / Trade-offs

- **[失去并行能力]** DAG 的 review+test 并行执行不再可用 → Mitigation: 现有场景中并行节省有限，顺序执行的简单性收益更大。如需并行可在未来通过并发 Promise.all 实现。
- **[Workflow 结果格式变更]** 删除 SwarmResult 后 workflow 的返回格式可能影响下游 → Mitigation: WorkflowResult 接口保持不变，只是内部实现从 DAG 切换为顺序调用。
- **[测试覆盖]** 删除大量测试后需要补充 workflow 增强测试 → Mitigation: 在 tasks 中包含 workflow 三阶段测试。
