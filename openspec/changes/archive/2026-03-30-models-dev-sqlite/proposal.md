## Why

当前 models.dev 缓存使用 JSON 文件存储（`WorkspacePersistence`），每次启动需要全量读取和解析 ~500KB JSON 到内存。查询 `fetchModelSpec("deepseek", "deepseek-chat")` 时需要遍历全部 providers 和 models。项目已有 `better-sqlite3` 依赖（用于 Session），迁移到 SQLite 可以按需查询、增量更新、启动秒开。

## What Changes

- 新增 `SqlitePersistence implements ModelsDevPersistence`，使用 `better-sqlite3` 替代 JSON 文件存储
- `providers` 表存储 provider 元数据（id, name, baseUrl, type, envKeys, npmPackage, defaultModel）
- `models` 表存储 model 元数据（id, providerId, contextWindow, maxOutputTokens, supportsVision, supportsTools, supportsReasoning, cost 等）
- `fetchModelSpec()` 改为直接 SQL 查询，无需加载全量数据
- `getProviderInfoSync()` 首次启动时可从 SQLite 加载，比 `STATIC_PROVIDERS` 更完整
- 保留 `WorkspacePersistence` 作为 fallback（SQLite 不可用时降级）
- **BREAKING**: `ModelsDevPersistence` 接口不变，但 `ModelsDevCache` 结构将不再被 SQLite 持久化层使用

## Capabilities

### New Capabilities

- `models-dev-persistence`: models.dev 数据的 SQLite 持久化层，包含 schema 定义、数据同步、查询接口

### Modified Capabilities

- `cost-tracking`: `fetchModelSpec()` 查询路径变更（从遍历内存 Map → SQL 查询），接口不变

## Impact

- `packages/core/src/providers/metadata/` — 新增 `sqlite-persistence.ts`，修改 `models-dev.ts`
- `packages/core/package.json` — 已有 `better-sqlite3`，无新增依赖
- `WorkspacePersistence` 保留但降级为 fallback
- 首次启动自动从 API 拉取数据写入 SQLite，后续启动直接读 SQLite
