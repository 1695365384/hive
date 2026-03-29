## ADDED Requirements

### Requirement: 数值参数边界约束
所有工具的数值输入参数 SHALL 通过 Zod schema 的 `.min()` / `.max()` 约束边界值，防止极端输入导致 DoS 或意外行为。

#### Scenario: bash timeout 范围限制
- **WHEN** 调用 bash-tool 传入 `timeout: 0` 或 `timeout: 999999999`
- **THEN** Zod schema SHALL 拒绝验证，返回错误

#### Scenario: glob maxResults 上限
- **WHEN** 调用 glob-tool 传入 `maxResults: 999999`
- **THEN** Zod schema SHALL 拒绝验证或自动 clamp 到最大值 1000

#### Scenario: web-fetch maxChars 上限
- **WHEN** 调用 web-fetch-tool 传入 `maxChars: 999999`
- **THEN** Zod schema SHALL 拒绝验证或自动 clamp 到最大值 100000

#### Scenario: glob 深度限制
- **WHEN** glob-tool 递归遍历目录时超过 20 层深度
- **THEN** 遍历 SHALL 停止并返回已收集的结果

### Requirement: web-search 结果截断
web-search-tool SHALL 对返回结果数量和总字符数进行限制。

#### Scenario: web-search 默认截断
- **WHEN** web-search-tool 返回超过 10 条结果
- **THEN** SHALL 截断并提示 "已截断显示前 N 条"
