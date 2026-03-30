## Context

models.dev 提供 `GET https://models.dev/api.json` 返回 ~500KB JSON，包含 80+ providers 和 500+ models。当前 `ModelsDevClient` 使用 `WorkspacePersistence` 将缓存写入 JSON 文件（24小时 TTL），每次启动全量加载到内存。

已有 `better-sqlite3` 依赖（用于 Session），可复用。`ModelsDevPersistence` 接口已抽象了存储层，只需新增一个 SQLite 实现。

## Goals / Non-Goals

**Goals:**
- 新增 `SqlitePersistence` 替代 `WorkspacePersistence` 作为默认持久化层
- `fetchModelSpec()` 改为 SQL 查询，无需全量加载
- 启动时从 SQLite 加载 provider 信息，比 `STATIC_PROVIDERS` 更完整
- 增量同步：API 数据变更时 `INSERT OR REPLACE`，不必全量重写

**Non-Goals:**
- 不改 `ModelsDevPersistence` 接口签名
- 不改 `ModelsDevClient` 的内存缓存层（仍保留 1 小时 TTL）
- 不做 models.dev 数据的实时推送/WebSocket
- 不迁移 Session 相关的 SQLite 数据库（保持独立数据库文件）

## Decisions

### D1: 新增 SqlitePersistence，不改接口

**选择**: 实现 `ModelsDevPersistence` 接口，`load()` 返回转换后的 `ModelsDevCache`，`save()` 写入 SQLite。

**理由**: `ModelsDevClient` 通过 `ModelsDevPersistence` 接口与存储层交互，接口不变意味着 `ModelsDevClient` 零改动（save/load 逻辑不变）。SQLite 的查询优势通过新增 `SqlitePersistence` 上的额外方法暴露，而非修改接口。

### D2: 直接 SQL 查询方法绕过 ModelsDevCache

**选择**: `SqlitePersistence` 新增 `getProviderInfo(providerId)` 和 `getModelSpec(providerId, modelId)` 方法，供 `ProviderRegistryImpl` 和 `fetchModelSpec()` 直接调用。

```
调用链（新增快速路径）:
fetchModelSpec("deepseek", "deepseek-chat")
  → SqlitePersistence.getModelSpec("deepseek", "deepseek-chat")
  → SELECT ... FROM models WHERE provider_id = ? AND id = ?
  → 返回 ModelSpec（单条查询，毫秒级）
```

**理由**: `ModelsDevPersistence` 接口的 `load()` 返回全量 `ModelsDevCache`，无法按需查询。通过在 `SqlitePersistence` 上新增查询方法，让调用方可以选择快速路径。`WorkspacePersistence` 没有这些方法，降级时自动走原路径。

### D3: 独立数据库文件

**选择**: models.dev 使用独立的 `.hive/models-dev.db` 数据库文件，不与 Session 的 `.hive/sessions.db` 共享。

**理由**: 生命周期不同（models.dev 缓存可随时删除重建），隔离更安全。

### D4: Schema 设计

```sql
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'openai-compatible',
  env_keys TEXT NOT NULL DEFAULT '[]',       -- JSON array
  npm_package TEXT NOT NULL DEFAULT '',
  default_model TEXT NOT NULL DEFAULT '',
  fetched_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS models (
  id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  family TEXT,
  context_window INTEGER NOT NULL DEFAULT 4096,
  max_output_tokens INTEGER,
  supports_vision INTEGER NOT NULL DEFAULT 0,
  supports_tools INTEGER NOT NULL DEFAULT 1,
  supports_reasoning INTEGER NOT NULL DEFAULT 0,
  input_modalities TEXT,                     -- JSON array
  output_modalities TEXT,                    -- JSON array
  cost_input REAL DEFAULT 0,
  cost_output REAL DEFAULT 0,
  cost_cache_read REAL,
  PRIMARY KEY (id, provider_id),
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id);
```

### D5: 降级策略

**选择**: SQLite 初始化失败时降级到 `WorkspacePersistence`。

```
优先级: SqlitePersistence → WorkspacePersistence → 内存缓存 → API → STATIC_PROVIDERS
```

## Risks / Trade-offs

- **better-sqlite3 native binding** — 在某些环境（Alpine Linux、musl）可能编译失败 → 已在 Session 模块使用，风险已验证
- **数据一致性** — SQLite 写入中途崩溃可能导致部分数据 → 使用事务（`BEGIN TRANSACTION` / `COMMIT`），每次全量同步在一个事务内完成
- **迁移兼容** — 已有 JSON 缓存文件的用户 → 首次启动时 SQLite 为空，自动从 API 拉取，JSON 文件自然过期废弃
