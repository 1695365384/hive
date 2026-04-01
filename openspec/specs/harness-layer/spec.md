## ADDED Requirements

### Requirement: ToolResult 结构化返回类型
系统 SHALL 定义 `ToolResult` 接口，包含 `ok: boolean`、`code: string`、`data?: string`、`error?: string`、`context?: Record<string, unknown>` 字段。所有内置工具的 execute 函数内部 SHALL 返回 ToolResult 而非纯字符串。

#### Scenario: 工具成功返回
- **WHEN** 工具执行成功
- **THEN** 返回 `ToolResult { ok: true, code: 'OK', data: '成功描述' }`

#### Scenario: 工具失败返回
- **WHEN** 工具执行失败（如文件不存在）
- **THEN** 返回 `ToolResult { ok: false, code: 'NOT_FOUND', error: '错误描述', context: { path: '...' } }`

### Requirement: 错误码分类体系
系统 SHALL 将错误码分为三类：TRANSIENT（瞬态可重试）、RECOVERABLE（可恢复，需 LLM 自愈）、BLOCKED（安全策略阻止）。

#### Scenario: TRANSIENT 错误触发静默重试
- **WHEN** 工具返回 TRANSIENT 类错误码（TIMEOUT, NETWORK, RATE_LIMITED）
- **THEN** harness SHALL 自动重试，最多 2 次，使用指数退避，不消耗 LLM step

#### Scenario: RECOVERABLE 错误注入 hint
- **WHEN** 工具返回 RECOVERABLE 类错误码（MATCH_FAILED, NOT_FOUND, PERMISSION, PATH_BLOCKED, INVALID_PARAM, EXEC_ERROR, IO_ERROR）
- **THEN** harness SHALL 在序列化结果中注入 hint，帮助 LLM 自愈

#### Scenario: BLOCKED 错误注入安全提示
- **WHEN** 工具返回 BLOCKED 类错误码（DANGEROUS_CMD, COMMAND_BLOCKED, SENSITIVE_FILE, UNKNOWN_COMMAND）
- **THEN** harness SHALL 注入 hint，建议 LLM 告知用户而非尝试绕过

### Requirement: withHarness 包装器
系统 SHALL 提供 `withHarness()` 高阶函数，接受 rawTool（execute → ToolResult）和 hint 模板，返回 AI SDK 兼容的 tool（execute → string）。

#### Scenario: 包装 rawTool 为 AI SDK 兼容工具
- **WHEN** rawTool 的 execute 返回 ToolResult
- **THEN** withHarness 包装后的 execute SHALL 返回序列化后的 string

#### Scenario: 异常兜底
- **WHEN** rawTool.execute 抛出未捕获的异常
- **THEN** withHarness SHALL 捕获异常并返回 `[Error] 工具内部异常: {message}` 字符串

#### Scenario: 成功结果无 hint
- **WHEN** ToolResult.ok 为 true
- **THEN** 序列化结果 SHALL 不包含 `[Hint]` 部分

### Requirement: Hint 模板注册表
系统 SHALL 提供 hint 模板注册表，按错误码索引。模板为 `(context: Record<string, unknown>) => string` 函数，接收 ToolResult 的 context 字段填充变量。

#### Scenario: 使用模板生成 hint
- **WHEN** ToolResult 不包含自定义 hint 且有对应模板
- **THEN** harness SHALL 使用模板 + context 生成 hint

#### Scenario: 无模板时静默跳过
- **WHEN** ToolResult 的错误码在注册表中无对应模板
- **THEN** 序列化结果 SHALL 不包含 `[Hint]` 部分

### Requirement: file-tool ToolResult 改造
file-tool 的所有返回点 SHALL 返回 ToolResult，映射关系：PERMISSION, PATH_BLOCKED, SENSITIVE_FILE, NOT_FOUND, MATCH_FAILED, INVALID_PARAM, UNKNOWN_COMMAND, IO_ERROR, OK。

#### Scenario: str_replace 未匹配
- **WHEN** str_replace 操作未找到 old_str
- **THEN** 返回 `{ ok: false, code: 'MATCH_FAILED', context: { path } }`

#### Scenario: 文件不存在
- **WHEN** view/str_replace/insert 操作目标文件不存在
- **THEN** 返回 `{ ok: false, code: 'NOT_FOUND', context: { path } }`

#### Scenario: 权限不足
- **WHEN** Agent 类型不允许执行某个命令
- **THEN** 返回 `{ ok: false, code: 'PERMISSION', context: { command, allowed } }`

### Requirement: bash-tool ToolResult 改造
bash-tool 的所有返回点 SHALL 返回 ToolResult，映射关系：PERMISSION, DANGEROUS_CMD, COMMAND_BLOCKED, TIMEOUT, EXEC_ERROR, OK。

#### Scenario: 命令超时
- **WHEN** bash 命令执行超时
- **THEN** 返回 `{ ok: false, code: 'TIMEOUT', context: { timeout } }`，harness 触发静默重试

#### Scenario: 危险命令阻止
- **WHEN** 命令匹配危险命令模式
- **THEN** 返回 `{ ok: false, code: 'DANGEROUS_CMD', context: { command, description } }`

#### Scenario: 命令执行失败
- **WHEN** 命令执行返回非零退出码（非超时）
- **THEN** 返回 `{ ok: false, code: 'EXEC_ERROR', context: { command } }`

### Requirement: tool-registry 集成
tool-registry 的 `getToolsForAgent()` SHALL 使用 withHarness 包装所有内置工具，确保所有 agent 类型自动获得 harness 能力。

#### Scenario: general agent 获得带 harness 的工具
- **WHEN** 获取 general agent 的工具集
- **THEN** file-tool 和 bash-tool 的 execute SHALL 经过 withHarness 包装

#### Scenario: explore agent 获得带 harness 的工具
- **WHEN** 获取 explore agent 的工具集
- **THEN** file-tool（只读版）的 execute SHALL 经过 withHarness 包装
