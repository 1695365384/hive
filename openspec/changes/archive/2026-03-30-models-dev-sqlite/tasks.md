## 1. SqlitePersistence 核心实现

- [x] 1.1 新增 `sqlite-persistence.ts`，实现 `ModelsDevPersistence` 接口，包含 `providers` 和 `models` 表的 schema 初始化
- [x] 1.2 实现 `save()` 方法：事务性全量写入（先 `DELETE` 旧数据，再 `INSERT` 新数据，单事务）
- [x] 1.3 实现 `load()` 方法：从 SQLite 读取数据转换为 `ModelsDevCache`，检查 24 小时 TTL
- [x] 1.4 实现 `getModelSpec(providerId, modelId)` 快速查询方法
- [x] 1.5 实现 `getProviderInfo(providerId)` 快速查询方法

## 2. 降级与集成

- [x] 2.6 修改 `provider-registry.ts` 的 `setPersistence()`，优先尝试 `SqlitePersistence`，失败时降级到 `WorkspacePersistence`
- [x] 2.7 修改 `models-dev.ts` 的 `fetchModelSpec()`，优先使用 `SqlitePersistence.getModelSpec()` 快速路径
- [x] 2.8 修改 `provider-registry.ts` 的 `getProviderInfoSync()`，首次启动时尝试从 SQLite 加载 provider 信息

## 3. 导出与测试

- [x] 3.9 更新 `metadata/index.ts` 导出 `SqlitePersistence` 和 `createSqlitePersistence`
- [x] 3.10 新增 `sqlite-persistence.test.ts`：测试 schema 初始化、save/load、getModelSpec、getProviderInfo
- [x] 3.11 新增 `persistence-fallback.test.ts`：测试 SQLite 失败时降级到 WorkspacePersistence
- [x] 3.12 运行全量测试确保无回归
