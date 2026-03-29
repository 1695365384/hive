## Context

当前蜂群系统每次执行单个 DAG。真实工作流需要多阶段编排：先 scan 发现问题，再根据问题严重程度决定是否需要深入修复。这种"根据阶段结果决定下一步"的能力，当前完全缺失。

现有架构：
- `SwarmCapability.run()` 执行单个 DAG
- `SwarmExecutor` 按层执行节点
- `Blackboard` 在单次 Swarm 内共享

约束：
- 每个 Stage 内部的 DAG 执行必须是确定性的
- 条件触发必须基于可检查的结构化数据（不依赖 LLM 自由决策）
- 必须保持全链路可追踪

## Goals / Non-Goals

**Goals:**
- 多个 Swarm 模板按顺序编排为 Pipeline
- 阶段之间支持条件触发（always / onField / onNodeFail）
- 所有阶段共享同一个 Blackboard
- 完整的执行追踪（阶段级 + 节点级）
- 支持用户在任意阶段暂停和人工确认

**Non-Goals:**
- 不在单个 DAG 内引入条件分支
- 不做动态子任务生成（节点数量在模板定义时确定）
- 不做跨 Swarm 实例的并行编排（阶段串行）

## Decisions

### D1: Pipeline 定义为阶段数组，每个阶段关联一个 Swarm 模板

**选择**: `Pipeline = PipelineStage[]`，每个 Stage 指定模板名 + 触发条件
**替代方案**: DAG of Stages（过度复杂，阶段间通常是串行的）

```typescript
interface PipelineStage {
  name: string;
  templateName: string;
  templateVariant?: 'simple' | 'medium' | 'complex';
  trigger: TriggerCondition;
}

type TriggerCondition =
  | { type: 'always' }
  | { type: 'onField'; field: string; operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains'; value: string | number }
  | { type: 'onNodeFail'; nodeId: string };
```

**理由**: 阶段间是自然串行关系，数组最直观。

### D2: 触发条件基于规则，不基于 LLM

**选择**: 结构化规则匹配（字段值比较）
**替代方案**: LLM 判断是否继续（引入黑盒）

`onField` 检查上一阶段结果中的结构化数据。例如 security 阶段输出 `{ severity: 'high' }`，下一阶段条件为 `{ type: 'onField', field: 'severity', operator: 'eq', value: 'high' }`。

结构化输出从哪里来？方案：在节点 prompt 中要求 Agent 输出 JSON 元数据行，在 `SwarmExecutor` 中解析并写入黑板。

### D3: 所有阶段共享同一个 Blackboard

**选择**: Pipeline 创建一个 Blackboard，传递给每个 Stage 的 SwarmExecutor
**替代方案**: 每个阶段独立 Blackboard，阶段间复制关键数据

共享黑板让后续阶段能通过 `{stageName.nodeId.result}` 访问前序阶段的所有节点结果。

### D4: 阶段结果写入黑板时包含 stage 前缀

为避免不同阶段同名节点冲突，节点 ID 在黑板中存储为 `stageName.nodeId`：
```typescript
blackboard.set('scan.security', { text: '...', severity: 'high' });
// 后续阶段通过 {scan.security.severity} 访问
```

### D5: Pipeline 入口在 Agent 类上

```typescript
agent.pipeline([
  { name: 'scan', templateName: 'code-review', variant: 'simple' },
  { name: 'fix', templateName: 'debug', trigger: { type: 'onField', field: 'scan.security.severity', operator: 'eq', value: 'high' } },
]);
```

### D6: 支持 `confirm: true` 暂停等待人工确认

在触发条件中增加人工确认模式：
```typescript
{ type: 'confirm', message: '发现高危安全问题，是否继续修复？' }
```

系统暂停 Pipeline，等待用户确认后继续。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| Agent 输出的结构化元数据不可靠 | prompt 中明确要求 JSON 格式；解析失败时 fallback 到 always |
| 阶段间串行增加总耗时 | 这是设计意图——阶段间需要依赖前序结果；简单任务会被 simple 变体快速完成 |
| Pipeline 概念增加用户学习成本 | pipeline() 方法语义清晰；提供 builder API 和预设 pipeline |
| 共享黑板可能内存压力 | 保持现有 maxLen 裁剪机制；Pipeline 完成后自动释放 |

## Open Questions

- 结构化元数据格式是否需要统一规范？（建议：JSON 行格式，以 `---META---` 开头）
- confirm 触发在前端如何实现？（WebSocket 推送确认请求）
