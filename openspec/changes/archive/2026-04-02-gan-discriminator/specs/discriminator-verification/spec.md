## ADDED Requirements

### Requirement: 复杂度自评标签
Agent SHALL 在复杂任务回复末尾标注 `[x-complex]`，在简单任务回复末尾标注 `[x-simple]`。系统 MUST 通过正则 `/\[x-(simple|complex)\]/` 从输出末尾提取标签。未标注时 MUST 默认为简单任务。

#### Scenario: Agent 标注复杂任务
- **WHEN** Main Agent 收到涉及多步骤操作或文件修改/命令执行的任务
- **THEN** Agent 在回复末尾输出 `[x-complex]`
- **THEN** 系统提取标签并进入验证循环

#### Scenario: Agent 标注简单任务
- **WHEN** Main Agent 收到单一操作任务（如回答问题、查看文件）
- **THEN** Agent 在回复末尾输出 `[x-simple]`
- **THEN** 系统跳过验证，直接返回结果

#### Scenario: Agent 未标注标签
- **WHEN** Main Agent 回复末尾不包含 `[x-simple]` 或 `[x-complex]`
- **THEN** 系统 MUST 默认为简单任务，直接返回结果（向后兼容）

### Requirement: Layer 1 规则验证
系统 SHALL 维护一份声明关键词与必须存在的工具调用的映射表。验证时 MUST 遍历映射表，检查 Agent 声明中是否包含关键词且对应的工具调用是否存在于 steps 中。匹配失败 MUST 返回 FAIL 及具体不匹配项。

#### Scenario: 虚假完成检测
- **WHEN** Agent 声明"已发送图片"但 steps 中不存在 send-file 工具调用
- **THEN** 规则验证器返回 FAIL
- **THEN** 失败原因包含"声称已发送图片但未调用 send-file 工具"

#### Scenario: 声明与工具调用一致
- **WHEN** Agent 声明"已修改配置文件"且 steps 中存在 file(str_replace) 调用
- **THEN** 规则验证器返回 PASS

#### Scenario: 无声明关键词匹配
- **WHEN** Agent 回复不包含任何映射表中的声明关键词
- **THEN** 规则验证器返回 PASS，进入 Layer 2 验证

### Requirement: Layer 2 Haiku 语义验证
规则验证 PASS 后，系统 SHALL 使用 Haiku 4.5 模型进行语义验证。输入 MUST 包含：原始任务、Agent 文本输出、完整工具调用记录（steps[]）。验证 MUST 检查：声明与行为一致性、是否存在虚假拒绝、结果是否满足任务要求、是否遗漏关键步骤。

#### Scenario: 虚假拒绝检测
- **WHEN** Agent 声称"做不到"但 toolRegistry 中有对应工具可完成该任务
- **THEN** Haiku 验证器返回 FAIL
- **THEN** 失败原因包含可用工具建议

#### Scenario: 部分完成检测
- **WHEN** Agent 声称"已完成全部修改"但 steps 中只修改了部分文件
- **THEN** Haiku 验证器返回 FAIL
- **THEN** 失败原因包含遗漏的操作项

#### Scenario: 结果满足任务要求
- **WHEN** Agent 的实际工具调用完整覆盖了任务要求的全部操作
- **THEN** Haiku 验证器返回 PASS

### Requirement: 验证失败反馈与重试
验证失败时，系统 SHALL 将完整上下文（原始任务 + 工具调用记录 + 验证失败原因）构造为用户消息，追加到对话历史中，重新执行 Main Agent。重试上限 MUST 为 3 轮。超过上限 MUST 返回明确失败。

#### Scenario: 首次验证失败后重试成功
- **WHEN** 第 1 轮验证 FAIL
- **THEN** 系统注入反馈消息并重新执行 Main Agent
- **WHEN** 第 2 轮验证 PASS
- **THEN** 系统返回成功结果

#### Scenario: 3 轮全部验证失败
- **WHEN** 连续 3 轮验证均 FAIL
- **THEN** 系统 MUST 返回明确的失败结果
- **THEN** 失败结果 MUST 包含验证失败原因

#### Scenario: 反馈消息格式
- **WHEN** 验证失败需要重试
- **THEN** 反馈消息 MUST 包含：原始任务文本、Agent 上次声明、完整工具调用记录、具体失败原因
- **THEN** 反馈消息 MUST 以用户消息角色追加到对话历史
