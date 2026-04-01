## ADDED Requirements

### Requirement: query-environment 内置工具
系统 SHALL 提供 `query-environment` 内置工具，允许 Agent 按需查询系统能力信息。工具 SHALL 支持两种查询模式：按关键词模糊查询和按类别精确查询。工具 SHALL 从 SQLite `env_tools` 表读取数据并返回结构化 JSON。

#### Scenario: 按关键词模糊查询
- **WHEN** Agent 调用 query-environment 工具，传入 `{ query: "python" }`
- **THEN** 工具 SHALL 返回所有名称包含 "python" 的工具，每项包含 `name`、`category`、`version`、`path` 字段

#### Scenario: 按类别查询
- **WHEN** Agent 调用 query-environment 工具，传入 `{ category: "buildTool" }`
- **THEN** 工具 SHALL 返回该类别下所有工具，每项包含 `name`、`category`、`version`、`path` 字段

#### Scenario: 组合查询
- **WHEN** Agent 同时传入 `{ query: "docker", category: "container" }`
- **THEN** 工具 SHALL 返回 category 为 "container" 且名称包含 "docker" 的工具

#### Scenario: 无匹配结果
- **WHEN** Agent 查询的关键词或类别无匹配
- **THEN** 工具 SHALL 返回空数组 `[]`

#### Scenario: 未提供任何查询参数
- **WHEN** Agent 调用工具时未提供 `query` 或 `category`
- **THEN** 工具 SHALL 返回错误提示，要求提供至少一个查询参数

#### Scenario: 环境探测尚未完成
- **WHEN** Agent 调用工具时 `env_tools` 表尚无数据（阶段 2 未完成）
- **THEN** 工具 SHALL 返回提示信息"环境探测尚未完成，请稍后再试"，不抛出异常

### Requirement: query-environment 工具注册
`query-environment` 工具 SHALL 注册到 ToolRegistry，对所有 Agent 类型（explore、plan、evaluator）可用。

#### Scenario: evaluator Agent 可用
- **WHEN** evaluator 类型的 Agent 列出可用工具
- **THEN** 列表中 SHALL 包含 `query-environment`

#### Scenario: explore Agent 可用
- **WHEN** explore 类型的 Agent 列出可用工具
- **THEN** 列表中 SHALL 包含 `query-environment`

### Requirement: env_tools SQLite 表
系统 SHALL 在 Server 启动时创建 `env_tools` 表（如不存在），包含 `name`（TEXT PRIMARY KEY）、`category`（TEXT NOT NULL）、`version`（TEXT）、`path`（TEXT）、`scanned_at`（INTEGER NOT NULL）字段。SHALL 在 `category` 字段上创建索引以加速类别查询。

#### Scenario: 表创建
- **WHEN** Server 启动且 `env_tools` 表不存在
- **THEN** 系统 SHALL 自动创建该表和 `idx_env_tools_category` 索引

#### Scenario: 表已存在
- **WHEN** Server 启动且 `env_tools` 表已存在
- **THEN** 系统 SHALL NOT 重复创建，直接使用现有表
