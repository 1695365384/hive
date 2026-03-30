## Why

Hive 的核心卖点是"多 Agent 协作"，但当前的多 Agent 能力存在根本性缺陷：

1. **无共享状态** — Agent 之间只靠返回值传递信息，Explore 的发现无法自动传递给 Implement
2. **无动态编排** — WorkflowCapability 是固定三阶段（analyze→execute→complete），实质只调一次 general agent
3. **并行能力浪费** — AgentRunner 已有 `runParallel`/`mapParallel`，但没有上层逻辑来利用它做智能并行
4. **不可追踪** — 子 Agent 执行过程是黑盒，不知道谁做了什么、结果如何

用户说"帮我加用户认证"，理想情况是 Explore/Plan/Implement/Review/Test 多个 Agent 同时协作、共享发现、合并结果。现在做不到。

## What Changes

新增 `SwarmCapability`，作为 `@bundy-lmw/hive-core` 的新能力模块，提供**规则驱动的多 Agent 协作引擎**：

- **SwarmTemplate** — 声明式蜂群模板（任务分解 DAG + 模型分配 + 聚合策略）
- **TaskGraph** — 显式任务依赖图（DAG），拓扑排序分层并行执行
- **Blackboard** — 结构化共享黑板，Agent 通过读写黑板传递中间产物
- **SwarmTracer** — 全链路执行追踪，每步输入/输出/耗时/模型可审计
- **SwarmExecutor** — DAG 执行引擎，基于现有 AgentRunner

### 内置蜂群模板

| 模板 | 触发模式 | Agent 组合 | 并行层 |
|------|----------|-----------|--------|
| `add-feature` | 添加/新增/implement | explore+plan→general→review+test | 3 层 |
| `debug` | bug/报错/fix | explore→plan→general→test | 4 层 |
| `code-review` | review/审查 | security+quality+test (全并行) | 1 层 |
| `refactor` | 重构/优化 | explore→general→test | 3 层 |

### 不包含

- LLM 做编排决策（必须是确定性规则，不能是黑盒）
- 对等蚁群/涌现行为（调试困难，不可追踪）
- 分布式执行（初期单机，复用现有 AgentRunner）
- 持久化黑板（黑板生命周期绑定单次 Swarm 执行）
- 自动任务分解（模板匹配失败时降级为普通 workflow）

## Capabilities

### New Capabilities

- `swarm`: 蜂群协作引擎（SwarmCapability）
  - `run(task, options?)` — 匹配模板、构建 DAG、执行、追踪、返回聚合结果
  - `registerTemplate(template)` — 注册自定义蜂群模板
  - `getTrace(id)` — 获取执行追踪记录

### Modified Capabilities

无。SwarmCapability 作为独立能力模块注册到现有 CapabilityRegistry，通过 AgentContext 访问 AgentRunner，不修改现有代码。

## Impact

### 新增文件

```
packages/core/src/agents/capabilities/SwarmCapability.ts  # 主入口
packages/core/src/agents/swarm/
├── types.ts          # SwarmTemplate, TaskGraph, Blackboard, TraceEvent
├── templates.ts      # 内置蜂群模板（add-feature, debug, review, refactor）
├── decomposer.ts     # 模板匹配 + prompt 渲染
├── blackboard.ts     # 共享黑板实现
├── executor.ts       # DAG 拓扑排序 + 分层并行执行
├── tracer.ts         # 执行追踪器
├── aggregator.ts     # 结果聚合策略
└── index.ts          # 导出
```

### 依赖关系

```
SwarmCapability → SwarmExecutor → AgentRunner (现有)
SwarmCapability → Blackboard (纯内存 Map)
SwarmCapability → SwarmTracer (纯日志)
```

### 对外 API 变化

```typescript
// Agent 新增方法
agent.swarm('帮我加用户认证模块');
agent.swarm('修复登录 bug', { template: 'debug' });
agent.swarm('审查这段代码', { template: 'code-review' });

// 高级用法：自定义模板
agent.swarmCapability.registerTemplate({
  name: 'my-template',
  match: /自定义/i,
  graph: { nodes: {...}, aggregate: 'final' },
});
```

## Risks / Trade-offs

| 风险 | 影响 | 缓解 |
|------|------|------|
| 模板匹配不够智能 | 非标准任务无法自动匹配 | 降级为普通 workflow；用户可自定义模板 |
| 黑板上下文膨胀 | 后层 Agent token 消耗大 | 自动裁剪超长黑板值（取首尾摘要） |
| 并行 Agent 数量过多 | API 限流 / 资源耗尽 | maxConcurrent 限制（默认 5） |
| DAG 循环依赖 | 执行死锁 | 构建时检测环，抛出明确错误 |
| 某层 Agent 全部失败 | 后续层无法执行 | 快速失败 + 返回已完成的中间结果 |

## Non-Goals

- 不用 LLM 做动态任务分解（确定性 > 灵活性）
- 不做跨进程/分布式蜂群（复用现有单进程架构）
- 不做持久化黑板（生命周期绑定单次执行）
- 不做 Agent 间直接通信（全部通过黑板间接协作）
