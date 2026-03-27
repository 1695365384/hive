## Why

当前蜂群模板匹配使用纯正则表达式，无法理解任务语义。用户输入"帮我修个 bug"和"帮我重构整个认证模块"都会匹配到 debug 模板，但前者只需 2 节点，后者需要 4 节点。规则匹配太死板导致简单任务浪费资源，复杂任务覆盖不足。需要在保持 DAG 执行层确定性的前提下，让模板选择更智能。

## What Changes

- 新增 LLM 分类层，用 Haiku 做快速任务分类（< 1000 tokens），输出结构化的任务类型和复杂度
- 现有 4 个内置模板拆分为变体（simple / medium / complex），分类器根据复杂度选择变体
- `SwarmTemplate` 新增 `variant` 字段，同一 `name` 可有多个复杂度变体
- `matchTemplate` 改为支持变体选择逻辑：先匹配模板名，再根据分类结果选变体
- 分类结果写入 `SwarmTracer`，保持完全可追踪
- 无匹配时的 fallback 保持不变（仍走 WorkflowCapability）

## Capabilities

### New Capabilities
- `smart-routing`: LLM 任务分类 + 模板变体选择机制，分类结果追踪

### Modified Capabilities
- 无需修改现有 capability 的需求，仅扩展 SwarmTemplate 类型定义

## Impact

- **新增类型**: `TaskClassification`, `TemplateVariant` 类型定义
- **修改文件**: `src/agents/swarm/types.ts`, `src/agents/swarm/decomposer.ts`, `src/agents/swarm/templates.ts`, `src/agents/capabilities/SwarmCapability.ts`
- **新增文件**: `src/agents/swarm/classifier.ts`（LLM 分类器）
- **API 兼容**: `SwarmTemplate` 新增可选字段 `variant`，现有模板不填则默认为 `medium`，完全向后兼容
- **成本**: 每次 swarm 执行增加一次 Haiku 分类调用（约 100-200 tokens），成本可忽略
