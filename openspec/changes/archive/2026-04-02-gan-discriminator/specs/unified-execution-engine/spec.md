## MODIFIED Requirements

### Requirement: DispatchResult 包含执行步骤
DispatchResult SHALL 包含可选的 `steps` 字段（类型为 StepResult[]），保留完整的工具调用记录。映射 RuntimeResult → DispatchResult 时 MUST 不再丢弃 steps。

#### Scenario: 复杂任务返回完整步骤
- **WHEN** Agent 执行复杂任务并完成
- **THEN** DispatchResult.steps MUST 包含每个执行步骤的 toolCalls、toolResults、text、finishReason

#### Scenario: 简单任务向后兼容
- **WHEN** 现有调用方不访问 steps 字段
- **THEN** 行为与改动前完全一致，steps 为可选字段不影响现有逻辑

### Requirement: dispatch 支持验证循环
dispatch() 方法 SHALL 在返回结果前，根据复杂度标签决定是否触发验证循环。复杂任务 MUST 经过 Evaluator 验证，验证通过后返回。简单任务 MUST 直接返回，不触发任何子 Agent。

#### Scenario: 复杂任务触发验证
- **WHEN** Agent 输出包含 `[x-complex]` 标签
- **THEN** dispatch() MUST 调用 Evaluator 验证最终结果
- **THEN** 验证 PASS 后返回 DispatchResult

#### Scenario: 简单任务跳过验证
- **WHEN** Agent 输出包含 `[x-simple]` 标签或无标签
- **THEN** dispatch() MUST 直接返回 DispatchResult，不调用 Evaluator
