## ADDED Requirements

### Requirement: 执行协议（防线 1）
intelligent.md 系统 prompt SHALL 包含执行协议指令，要求 Agent 在声明完成前必须先调用工具执行任务。协议 MUST 以步骤化格式呈现（分析 → 执行 → 确认 → 声明），而非模糊的建议。

#### Scenario: Agent 遵循执行协议
- **WHEN** 用户请求涉及文件修改、命令执行等操作的任务
- **THEN** Agent MUST 先调用工具执行操作，再输出包含结果的最终回复
- **THEN** Agent MUST NOT 在调用工具之前声明"已经完成"或"已经帮你做好了"

#### Scenario: 纯问答任务不受影响
- **WHEN** 用户提问不涉及任何操作（如"什么是闭包"）
- **THEN** Agent 正常回复，不触发任何执行协议流程

### Requirement: 零工具调用拦截（防线 2）
ExecutionCapability.run() 在 Agent 执行完毕后 SHALL 检查工具调用记录。当 `tools.length === 0` 且任务被判定为 action task 时，系统 MUST 注入反馈消息并重新调用 LLMRuntime，最多重试 1 次。

#### Scenario: 零工具调用被拦截
- **WHEN** Agent 执行完毕且 `tools.length === 0` 且任务为 action task
- **THEN** 系统 MUST 注入反馈消息（包含原始任务和"你还没有调用任何工具，请使用合适的工具实际执行"提示）
- **THEN** 系统 MUST 重新调用 LLMRuntime，将反馈消息追加到对话历史中

#### Scenario: 重试后成功执行
- **WHEN** 防线 2 重试后 Agent 调用了工具
- **THEN** 系统 MUST 正常返回 DispatchResult，包含工具调用记录

#### Scenario: 重试后仍然零工具调用
- **WHEN** 防线 2 重试后 `tools.length` 仍然为 0
- **THEN** 系统 MUST 返回当前结果，不进行第二次重试

#### Scenario: 只读模式不触发防线 2
- **WHEN** `forceMode` 为 'explore' 或 'plan'
- **THEN** 系统 MUST 跳过零工具调用拦截

### Requirement: steps 注入自省（防线 3）
当 `tools.length > 0` 且为 action task 时，系统 SHALL 将 steps 格式化为摘要注入对话历史，让 Agent 自行确认是否完成了全部操作。自省最多触发 1 次额外 LLM 调用。

#### Scenario: 自省确认完成
- **WHEN** Agent 执行完毕且 `tools.length > 0` 且为 action task
- **THEN** 系统 MUST 将 steps 摘要格式化为用户消息注入对话历史
- **THEN** 系统 MUST 追加确认请求（"请确认你是否已完成所有操作。如未完成，请继续执行。"）
- **WHEN** Agent 确认已完成
- **THEN** 系统 MUST 返回最终 DispatchResult

#### Scenario: 自省发现未完成并继续执行
- **WHEN** Agent 在自省后意识到未完成全部操作
- **THEN** Agent MUST 继续调用工具执行剩余操作
- **THEN** 系统 MUST 返回包含所有工具调用的最终 DispatchResult

#### Scenario: 只读模式不触发防线 3
- **WHEN** `forceMode` 为 'explore' 或 'plan'
- **THEN** 系统 MUST 跳过 steps 注入自省

#### Scenario: 纯问答任务不触发防线 3
- **WHEN** 任务被判定为非 action task
- **THEN** 系统 MUST 跳过 steps 注入自省，直接返回结果

### Requirement: action task 判定
系统 SHALL 提供判定逻辑区分 action task 和纯问答任务。判定结果决定是否触发防线 2 和防线 3。

#### Scenario: 包含动作动词的任务判定为 action task
- **WHEN** 任务文本包含动作相关表述（涉及文件操作、命令执行、发送、安装、配置等）
- **THEN** 系统 MUST 判定为 action task

#### Scenario: 纯问答任务不触发防线
- **WHEN** 任务为简短的纯信息查询（不包含动作动词且长度较短）
- **THEN** 系统 MUST 判定为非 action task，跳过防线 2 和防线 3
