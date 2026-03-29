## ADDED Requirements

### Requirement: Pipeline definition with ordered stages

系统 SHALL 支持将多个 Swarm 模板按顺序编排为 Pipeline。

#### Scenario: Create a two-stage pipeline
- **WHEN** 用户定义 `[{ name: 'scan', templateName: 'code-review' }, { name: 'fix', templateName: 'debug' }]`
- **THEN** 系统按顺序执行 scan 和 fix 两个阶段
- **AND** scan 阶段的黑板结果对 fix 阶段可见

#### Scenario: Empty pipeline
- **WHEN** 用户定义空数组 `[]`
- **THEN** 系统返回空结果，不执行任何 Swarm

### Requirement: Conditional stage triggering

系统 SHALL 支持基于规则的条件触发，控制阶段是否执行。

#### Scenario: Always trigger
- **WHEN** 阶段触发条件为 `{ type: 'always' }`
- **THEN** 该阶段无条件执行

#### Scenario: onField trigger with matching condition
- **WHEN** 上一阶段结果中 `severity` 字段值为 `high`
- **AND** 触发条件为 `{ type: 'onField', field: 'severity', operator: 'eq', value: 'high' }`
- **THEN** 该阶段被执行

#### Scenario: onField trigger with non-matching condition
- **WHEN** 上一阶段结果中 `severity` 字段值为 `low`
- **AND** 触发条件为 `{ type: 'onField', field: 'severity', operator: 'eq', value: 'high' }`
- **THEN** 该阶段被跳过
- **AND** tracer 记录 `stage.skipped` 事件

#### Scenario: onNodeFail trigger
- **WHEN** 上一阶段中 `fix` 节点执行失败
- **AND** 触发条件为 `{ type: 'onNodeFail', nodeId: 'fix' }`
- **THEN** 触发该阶段执行（如补救流程）

### Requirement: Shared blackboard across pipeline stages

系统 SHALL 为 Pipeline 创建一个共享 Blackboard，所有阶段读写同一个黑板。

#### Scenario: Later stage reads earlier stage results
- **WHEN** scan 阶段完成，结果写入黑板
- **THEN** fix 阶段可通过 `{scan.security.result}` 访问 scan 阶段的结果

#### Scenario: Stage prefix avoids node ID collision
- **WHEN** scan 阶段有 `security` 节点，fix 阶段也有 `security` 节点
- **THEN** 黑板中分别存储为 `scan.security` 和 `fix.security`
- **AND** prompt 模板中使用 `{scan.security.result}` 和 `{fix.security.result}` 区分

### Requirement: Confirm trigger for human-in-the-loop

系统 SHALL 支持 `confirm` 触发类型，暂停 Pipeline 等待用户确认。

#### Scenario: Confirm trigger pauses execution
- **WHEN** 阶段触发条件为 `{ type: 'confirm', message: '确认修复？' }`
- **THEN** 系统暂停 Pipeline 执行
- **AND** 通过 `onPhase` 回调通知宿主应用

#### Scenario: Confirm approved resumes pipeline
- **WHEN** 用户确认继续
- **THEN** 系统恢复执行被暂停的阶段

#### Scenario: Confirm rejected skips stage
- **WHEN** 用户拒绝继续
- **THEN** 该阶段被跳过
- **AND** Pipeline 继续执行后续阶段

### Requirement: Pipeline execution tracing

系统 SHALL 为 Pipeline 生成完整的执行追踪，包含阶段级和节点级事件。

#### Scenario: Pipeline trace includes stage events
- **WHEN** Pipeline 执行完成
- **THEN** tracer 事件包含 `stage.start`、`stage.complete`、`stage.skipped` 事件
- **AND** 每个 stage 事件包含 `{ stageName, template, variant, duration }`

#### Scenario: Pipeline trace report
- **WHEN** 用户调用 `tracer.report()`
- **THEN** 报告按阶段分层显示，每个阶段内显示节点详情
