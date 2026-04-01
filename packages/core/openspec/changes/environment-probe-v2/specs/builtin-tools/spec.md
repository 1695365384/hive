## ADDED Requirements

### Requirement: query-environment 工具定义
系统 SHALL 在 builtin-tools 规范中新增 `query-environment` 工具。工具 SHALL 接受 `query`（字符串，模糊搜索关键词）和 `category`（字符串，精确类别名）两个可选参数，至少需要提供其中一个。工具 SHALL 返回 JSON 数组，每项包含 `name`（工具名）、`category`（类别）、`version`（版本号，可能为 null）、`path`（可执行文件路径）。

#### Scenario: 工具参数校验
- **WHEN** Agent 调用 query-environment 工具，未提供 `query` 也未提供 `category`
- **THEN** 工具 SHALL 返回错误信息，提示至少提供一个查询参数

#### Scenario: 返回数据格式
- **WHEN** 查询返回结果
- **THEN** 每项结果 SHALL 包含 `name`、`category`、`version`、`path` 四个字段
- **THEN** `version` 字段可为 `null`（版本探测失败时）
