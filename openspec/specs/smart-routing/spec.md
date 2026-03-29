## ADDED Requirements

### Requirement: Task classification before template matching

系统 SHALL 在模板匹配之前对任务进行分类，输出结构化的任务类型和复杂度。

#### Scenario: Classify a simple debug task
- **WHEN** 用户执行 `swarm('修个 typo')`
- **THEN** 分类器输出 `{ type: 'debug', complexity: 'simple', confidence: > 0.7 }`
- **AND** 系统选择 `debug-simple` 变体模板（2 节点）

#### Scenario: Classify a complex refactoring task
- **WHEN** 用户执行 `swarm('重构整个认证系统，支持 OAuth2 和 SAML')`
- **THEN** 分类器输出 `{ type: 'refactor', complexity: 'complex', confidence: > 0.7 }`
- **AND** 系统选择 `refactor-complex` 变体模板（5 节点）

#### Scenario: Classification failure falls back to medium variant
- **WHEN** 分类器返回 `confidence < 0.5`
- **THEN** 系统选择对应模板的 `medium` 变体
- **AND** tracer 记录 `classifier.low-confidence` 事件

#### Scenario: User skips classification
- **WHEN** 用户执行 `swarm(task, { classify: false })`
- **THEN** 系统跳过 LLM 分类，直接走正则匹配
- **AND** tracer 不记录 `classifier.*` 事件

### Requirement: Template variant selection

`SwarmTemplate` SHALL 支持可选的 `variant` 字段区分同族模板的不同复杂度变体。

#### Scenario: Exact variant match
- **WHEN** 分类结果为 `{ type: 'debug', complexity: 'simple' }`
- **AND** 存在 `debug-simple` 模板
- **THEN** 系统使用该模板构建 DAG

#### Scenario: Variant fallback to medium
- **WHEN** 分类结果为 `{ complexity: 'simple' }`
- **AND** 不存在对应 variant 的模板
- **THEN** 系统 fallback 到同 name 的 `medium` 变体
- **AND** tracer 记录 `template.variant-fallback` 事件

#### Scenario: No variant defaults to medium
- **WHEN** 用户注册自定义模板不指定 variant
- **THEN** 系统将其视为 `medium` 变体
- **AND** 可通过 `variant: 'simple'` 覆盖

### Requirement: Classification result traceability

分类器的完整结果 SHALL 写入 `SwarmTracer`，保持执行全链路可审计。

#### Scenario: Classification event in trace
- **WHEN** swarm 执行完成
- **THEN** trace 事件中包含 `classifier.complete` 事件
- **AND** 事件 metadata 包含 `{ type, complexity, confidence, model, latency }`

#### Scenario: Trace report shows classification
- **WHEN** 用户调用 `tracer.report()`
- **THEN** 报告中显示分类结果（类型、复杂度、置信度）

### Requirement: Built-in template variants

系统 SHALL 为每个内置模板提供 simple / medium / complex 三个变体。

#### Scenario: debug-simple variant
- **WHEN** 使用 debug-simple 变体
- **THEN** DAG 包含 2 个节点（explore → fix）
- **AND** 跳过 analyze 和 verify 步骤

#### Scenario: add-feature-complex variant
- **WHEN** 使用 add-feature-complex 变体
- **THEN** DAG 包含安全审计节点（explore + plan → implement → security-audit → review → test）
- **AND** 聚合结果包含安全审计输出
