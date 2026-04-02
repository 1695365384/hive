## ADDED Requirements

### Requirement: Task type inference from tool results
系统 SHALL 从已执行的工具调用结果中推断任务类型，不使用硬编码阈值或额外 LLM 调用。任务类型分为 `information`（仅包含读工具调用）、`action`（包含写工具调用）、`unknown`（零工具调用）。

#### Scenario: Information query with Read tool
- **WHEN** Agent 执行过程中调用了 Read 工具且未调用任何写工具
- **THEN** 系统推断任务类型为 `information`

#### Scenario: Action task with Write tool
- **WHEN** Agent 执行过程中调用了 Write 或 Edit 工具
- **THEN** 系统推断任务类型为 `action`

#### Scenario: Mixed read and write tools
- **WHEN** Agent 执行过程中同时调用了读工具（Read/Glob）和写工具（Write/Edit）
- **THEN** 系统推断任务类型为 `action`（保守策略）

#### Scenario: No tool calls
- **WHEN** Agent 执行过程中没有任何工具调用
- **THEN** 系统推断任务类型为 `unknown`

### Requirement: Evidence-based completion check
系统 SHALL 基于工具调用结果的确定性信号判断任务完成度，不使用 LLM 自省或 LLM-as-Judge。验证结果 SHALL NOT 覆盖 Agent 的原始输出文本。

#### Scenario: Information query completed successfully
- **WHEN** 任务类型为 `information` 且至少一个工具调用返回成功且包含非空数据
- **THEN** 判定任务完成，返回 Agent 原始输出

#### Scenario: Information query with no data
- **WHEN** 任务类型为 `information` 且所有工具调用返回空数据或失败
- **THEN** 判定任务未完成，但仍返回 Agent 原始输出并记录警告日志

#### Scenario: Action task all writes succeeded
- **WHEN** 任务类型为 `action` 且所有写操作工具调用返回成功
- **THEN** 判定任务完成，返回 Agent 原始输出

#### Scenario: Action task partial write failure
- **WHEN** 任务类型为 `action` 且部分写操作工具调用返回失败
- **THEN** 判定任务未完成，但仍返回 Agent 原始输出并记录警告日志

#### Scenario: Unknown task type
- **WHEN** 任务类型为 `unknown`（零工具调用）
- **THEN** 保守处理，信任 Agent 原始输出，不触发验证

### Requirement: Differentiated zero-tool-call handling
系统 SHALL 对零工具调用场景进行差异化处理，而非统一拦截重试。

#### Scenario: Unknown type with zero tool calls
- **WHEN** 任务类型推断为 `unknown` 且未调用任何工具
- **THEN** 触发拦截重试（Agent 可能偷懒，需要实际执行操作）

#### Scenario: ForceMode explore/plan with zero tool calls
- **WHEN** 任务在 explore 或 plan 模式下执行且未调用任何工具
- **THEN** 不触发拦截（只读模式下的纯知识问答是合理的）

### Requirement: No LLM introspection for verification
系统 SHALL NOT 使用 LLM 自省（让 LLM 判断自己是否完成任务）作为验证手段。验证 MUST 基于工具调用结果的确定性信号。

#### Scenario: Verification produces no additional LLM calls
- **WHEN** Agent 执行完成并进入验证阶段
- **THEN** 验证过程不产生任何额外的 LLM API 调用

#### Scenario: Original result never overwritten
- **WHEN** 验证阶段运行完毕
- **THEN** Agent 的原始输出文本（`result.text`）保持不变，不被任何验证结果覆盖
