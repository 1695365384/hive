## MODIFIED Requirements

### Requirement: file-tool 消除 TOCTOU 竞态
file-tool SHALL 使用 try/catch 处理文件不存在错误，不使用 `existsSync()` 预检查。

#### Scenario: 文件不存在时返回友好错误
- **WHEN** 调用 file-tool view 时文件不存在
- **THEN** SHALL 捕获 ENOENT 错误并返回 `[Error] 文件不存在: <path>`，不抛出异常

#### Scenario: 并发操作不产生竞态
- **WHEN** 两个操作同时对同一文件执行 view 和 str_replace
- **THEN** 操作 SHALL 顺序执行并正确处理冲突

### Requirement: file-tool 类型安全
file-tool SHALL 使用 Zod discriminated union 按命令类型分离必填字段，不使用 `!` 非空断言。

#### Scenario: create 命令需要 content
- **WHEN** 调用 file-tool 传入 `command: "create"` 但未传 `content`
- **THEN** Zod schema SHALL 拒绝验证（content 为 create 命令的必填字段）

#### Scenario: view 命令忽略 content
- **WHEN** 调用 file-tool 传入 `command: "view"` 和 `content: "xxx"`
- **THEN** content 字段 SHALL 被忽略或 schema 不要求

### Requirement: web-search 结果限制
web-search-tool SHALL 限制返回结果数量并应用 `truncateOutput`。

#### Scenario: 结果过多时截断
- **WHEN** web-search-tool 返回超过默认结果数
- **THEN** SHALL 截断结果并提示总数
