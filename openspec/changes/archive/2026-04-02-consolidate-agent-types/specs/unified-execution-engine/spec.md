## MODIFIED Requirements

### Requirement: DispatchResult 包含执行步骤
DispatchResult SHALL 包含可选的 `steps` 字段（类型为 StepResult[]），保留完整的工具调用记录。映射 RuntimeResult → DispatchResult 时 MUST 不再丢弃 steps。

#### Scenario: action task 返回完整步骤
- **WHEN** Agent 执行 action task 并完成
- **THEN** DispatchResult.steps MUST 包含每个执行步骤的 toolCalls、toolResults、text、finishReason

#### Scenario: 简单任务向后兼容
- **WHEN** 现有调用方不访问 steps 字段
- **THEN** 行为与改动前完全一致，steps 为可选字段不影响现有逻辑
