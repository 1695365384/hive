## Why

智能路由（Level 1）解决了"选哪个模板"的问题，但每个模板仍是单次 DAG 执行。真实工作流往往是**多阶段**的：先探索发现问题，再决定是否需要深入。当前蜂群无法表达这种"根据上一阶段结果决定是否执行下一阶段"的逻辑。

Pipeline 组合让多个 Swarm 模板串联成多阶段工作流，每个阶段仍然是确定性 DAG，但阶段之间可以有条件触发。这在不引入黑盒的前提下，显著扩展覆盖场景。

## What Changes

- 新增 `Pipeline` 概念：多个 Swarm 模板按顺序编排，共享黑板
- 新增 `PipelineStage` 类型：关联一个 Swarm 模板 + 触发条件
- 新增 `PipelineExecutor`：顺序执行 stages，每阶段内部走现有 SwarmExecutor
- 触发条件基于**结构化输出 + 用户配置规则**（非 LLM 自由决策）：
  - `always`: 无条件执行
  - `onField`: 当上一阶段结果的某个字段满足条件时触发（如 `severity === 'high'`）
  - `onNodeFail`: 当某个节点失败时触发（补救流程）
- `Agent` 类新增 `pipeline()` 方法作为入口
- 每个阶段独立创建 SwarmTracer，Pipeline 整体有一个汇总 tracer

## Capabilities

### New Capabilities
- `pipeline-composition`: Pipeline 定义、条件触发规则、多阶段编排执行

### Modified Capabilities
- 无现有 capability 需求变更，Pipeline 是 Swarm 之上的编排层

## Impact

- **新增类型**: `Pipeline`, `PipelineStage`, `TriggerCondition`, `FieldMatchRule`
- **新增文件**: `src/agents/pipeline/types.ts`, `src/agents/pipeline/executor.ts`, `src/agents/pipeline/index.ts`
- **修改文件**: `src/agents/core/Agent.ts`（新增 `pipeline()` 方法）
- **依赖关系**: 依赖 smart-routing 的分类结果（可选增强，非必需）
- **API 兼容**: 完全新 API，不影响现有 swarm() 方法
- **向后兼容**: 现有 swarm() 方法不受影响
