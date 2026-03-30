### Requirement: SQLite 持久化层
系统 SHALL 提供 `SqlitePersistence` 类实现 `ModelsDevPersistence` 接口，使用 `better-sqlite3` 存储 models.dev 数据到 `.hive/models-dev.db`。

#### Scenario: 首次启动创建数据库
- **WHEN** 系统启动且 `.hive/models-dev.db` 不存在
- **THEN** 系统 SHALL 自动创建数据库文件并初始化 `providers` 和 `models` 表

#### Scenario: 数据库已存在且未过期
- **WHEN** 系统启动且 SQLite 中 `fetched_at` 距今不超过 24 小时
- **THEN** `load()` SHALL 返回有效的 `ModelsDevCache`，不触发 API 请求

#### Scenario: 数据库已过期
- **WHEN** 系统启动且 SQLite 中数据超过 24 小时
- **THEN** `load()` SHALL 返回 null，触发 `ModelsDevClient` 从 API 重新拉取

### Requirement: 按需查询 ModelSpec
`SqlitePersistence` SHALL 提供 `getModelSpec(providerId, modelId)` 方法，直接通过 SQL 查询单个模型信息，无需全量加载。

#### Scenario: 查询存在的模型
- **WHEN** 调用 `getModelSpec("deepseek", "deepseek-chat")` 且 SQLite 中有对应记录
- **THEN** SHALL 返回包含 `contextWindow`、`maxOutputTokens`、`supportsTools` 等字段的 `ModelSpec` 对象

#### Scenario: 查询不存在的模型
- **WHEN** 调用 `getModelSpec("unknown", "unknown-model")` 且 SQLite 中无对应记录
- **THEN** SHALL 返回 null

### Requirement: 按需查询 ProviderInfo
`SqlitePersistence` SHALL 提供 `getProviderInfo(providerId)` 方法，直接通过 SQL 查询单个 provider 信息。

#### Scenario: 查询存在的 provider
- **WHEN** 调用 `getProviderInfo("deepseek")` 且 SQLite 中有对应记录
- **THEN** SHALL 返回包含 `baseUrl`、`type`、`envKeys`、`defaultModel` 的 `ProviderInfo` 对象

#### Scenario: 查询不存在的 provider
- **WHEN** 调用 `getProviderInfo("nonexistent")` 且 SQLite 中无对应记录
- **THEN** SHALL 返回 null

### Requirement: 事务性全量同步
`save()` SHALL 在单个 SQLite 事务内完成全量数据写入，确保原子性。

#### Scenario: 同步过程中断
- **WHEN** `save()` 执行过程中发生错误（如磁盘满）
- **THEN** 事务 SHALL 回滚，数据库保持 `save()` 之前的状态

#### Scenario: 正常同步完成
- **WHEN** `save()` 成功完成
- **THEN** `providers` 和 `models` 表 SHALL 包含最新的 models.dev 数据，`fetched_at` 和 `updated_at` 更新为当前时间

### Requirement: 降级到 JSON 文件持久化
当 SQLite 初始化失败时，系统 SHALL 自动降级到 `WorkspacePersistence`。

#### Scenario: better-sqlite3 加载失败
- **WHEN** `new Database(dbPath)` 抛出异常
- **THEN** 系统 SHALL fallback 到 `WorkspacePersistence`，并在日志中记录警告

#### Scenario: SQLite 正常但查询失败
- **WHEN** `getModelSpec()` 或 `getProviderInfo()` SQL 查询失败
- **THEN** SHALL 返回 null，不影响原有内存缓存和 STATIC_PROVIDERS fallback 路径
