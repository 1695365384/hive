## ADDED Requirements

### Requirement: Bash tool harness integration
真实 BashTool 经过 harness 管道后，MUST 产出格式正确的 string 输出，包含正确的状态前缀和 hint。

#### Scenario: 成功执行命令
- **WHEN** 执行 `echo hello` 命令
- **THEN** rawTool 返回 `{ ok: true, code: 'OK', data: 'hello' }`
- **AND** 序列化后的 string 包含 `[OK]` 前缀和 `hello`

#### Scenario: 命令执行失败（非零退出码）
- **WHEN** 执行 `ls /nonexistent-path-xyz` 命令
- **THEN** rawTool 返回 `{ ok: true, code: 'OK', data: ... }`（stderr 合并在 stdout 中）
- **AND** 序列化后的 string 包含 `[OK]`（非零退出码不一定是工具错误）

#### Scenario: 危险命令拦截
- **WHEN** 执行 `rm -rf /` 命令
- **THEN** rawTool 返回 `{ ok: false, code: 'DANGEROUS_CMD' }`
- **AND** 序列化后的 string 包含 `[Security]` 前缀和 `[Hint]`

#### Scenario: 权限拦截
- **WHEN** 使用 `createBashTool({ allowed: false })` 执行任意命令
- **THEN** rawTool 返回 `{ ok: false, code: 'PERMISSION' }`
- **AND** 序列化后的 string 包含 `[Permission]` 前缀

### Requirement: File tool harness integration
真实 FileTool 经过 harness 管道后，MUST 产出格式正确的 string 输出。

#### Scenario: 成功创建文件
- **WHEN** 在临时目录创建文件并写入内容
- **THEN** rawTool 返回 `{ ok: true, code: 'OK', data: '文件已创建: ...' }`
- **AND** 序列化后的 string 包含 `[OK]`

#### Scenario: 成功查看文件
- **WHEN** 查看已创建的文件
- **THEN** rawTool 返回 `{ ok: true, code: 'OK', data: <文件内容> }`
- **AND** 序列化后的 string 包含 `[OK]`

#### Scenario: 成功替换文件内容
- **WHEN** 对已创建文件执行 str_replace 操作
- **THEN** rawTool 返回 `{ ok: true, code: 'OK', data: '替换了 1 处' }`
- **AND** 序列化后的 string 包含 `[OK]`

#### Scenario: 替换失败（文本不匹配）
- **WHEN** 尝试替换文件中不存在的文本
- **THEN** rawTool 返回 `{ ok: false, code: 'MATCH_FAILED' }`
- **AND** 序列化后的 string 包含 `[Error]` 前缀和 `[Hint]`
- **AND** hint 中包含文件路径

#### Scenario: 查看不存在的文件
- **WHEN** 查看不存在的文件路径
- **THEN** rawTool 返回 `{ ok: false, code: 'NOT_FOUND' }`
- **AND** 序列化后的 string 包含 `[Error]` 和 `[Hint]`

#### Scenario: 敏感文件拦截
- **WHEN** 尝试写入 `.ssh/id_rsa` 路径
- **THEN** rawTool 返回 `{ ok: false, code: 'SENSITIVE_FILE' }`
- **AND** 序列化后的 string 包含 `[Security]` 前缀和 `[Hint]`

#### Scenario: 只读权限控制
- **WHEN** 使用 `createFileTool({ allowedCommands: ['view'] })` 执行 create 操作
- **THEN** rawTool 返回 `{ ok: false, code: 'PERMISSION' }`
- **AND** 序列化后的 string 包含 `[Permission]` 前缀和 `[Hint]`

### Requirement: Retry integration
TRANSIENT 错误经过 retryWithBackoff 后 MUST 按预期重试。

#### Scenario: 超时触发重试
- **WHEN** bash 命令执行超时（timeout: 1000ms + sleep 5）
- **THEN** rawTool 返回 `{ ok: false, code: 'TIMEOUT' }`
- **AND** 该错误码被标记为 TRANSIENT（isRetryable = true）
- **AND** retryWithBackoff 会重试

### Requirement: 异常兜底
rawTool 抛出异常时，harness MUST 捕获并返回 `[Error]` string。

#### Scenario: rawTool throw 被捕获
- **WHEN** rawTool.execute 抛出 Error
- **THEN** withHarness 包装后的 tool 返回包含 `[Error]` 和 `工具内部异常` 的 string
