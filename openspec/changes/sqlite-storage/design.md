## Context

Hive 当前使用 JSON 文件存储会话数据，每个 Session 一个文件。Memory 工具使用纯内存 Map 存储，进程重启后丢失。`better-sqlite3` 已在依赖中但未使用。

**当前架构:**
```
.hive/
├── sessions/
│   ├── default/
│   │   └── {sessionId}.json
│   └── archive/
└── memory/          # 未使用
```

**目标架构:**
```
.hive/
├── hive.db          # SQLite 数据库（单文件）
├── hive.db-wal      # WAL 模式日志
└── hive.db-shm      # 共享内存
```

## Goals / Non-Goals

**Goals:**
- Session + Memory 数据持久化到 SQLite
- 支持复杂查询（按标签搜索、时间范围、统计）
- 单数据库文件，便于备份和迁移
- 保持现有 API 接口兼容
- 提供 JSON → SQLite 数据迁移工具

**Non-Goals:**
- 不做向量搜索（未来可扩展）
- 不做多工作空间共享数据库
- 不做远程数据库支持（仅本地 SQLite）

## Decisions

### D1: 使用 better-sqlite3（已安装）

**选择:** better-sqlite3
**替代方案:**
- `sql.js` - 纯 JS，无 native 依赖，但性能差 3-5x
- `bun:sqlite` - Bun 内置，但限制运行时
- `sqlite3` - 异步 API，回调地狱

**理由:**
- 同步 API，代码简洁
- 性能最优（native binding）
- 已在依赖中，零额外成本
- WAL 模式支持并发读

### D2: Schema 设计

```sql
-- 会话表
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  group_name TEXT NOT NULL DEFAULT 'default',
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata JSON,           -- { totalTokens, messageCount, compressionCount, ... }
  compression_state JSON   -- 压缩状态（可选）
);

-- 消息表（一对多）
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  token_count INTEGER,
  sequence INTEGER NOT NULL,  -- 消息顺序
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 记忆表
CREATE TABLE memories (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  tags JSON,              -- ['tag1', 'tag2']
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 索引
CREATE INDEX idx_sessions_group ON sessions(group_name);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);
CREATE INDEX idx_messages_session ON messages(session_id, sequence);
CREATE INDEX idx_memories_tags ON memories(tags);  -- JSON 索引（SQLite 3.38+）
```

### D3: Repository 模式

```
packages/core/src/storage/
├── Database.ts           # SQLite 连接管理、WAL 配置
├── SessionRepository.ts  # Session CRUD
├── MemoryRepository.ts   # Memory CRUD
├── MigrationRunner.ts    # Schema 迁移
└── index.ts

packages/core/src/storage/migrations/
├── 001-initial.ts        # 初始 Schema
└── index.ts
```

**接口设计:**
```typescript
interface ISessionRepository {
  save(session: Session): Promise<void>;
  load(sessionId: string): Promise<Session | null>;
  delete(sessionId: string): Promise<boolean>;
  list(group?: string): Promise<SessionListItem[]>;
  getMostRecent(): Promise<Session | null>;
}

interface IMemoryRepository {
  set(key: string, value: MemoryEntry): Promise<void>;
  get(key: string): Promise<MemoryEntry | null>;
  getAll(): Promise<Record<string, MemoryEntry>>;
  getByTag(tag: string): Promise<MemoryEntry[]>;
  delete(key: string): Promise<boolean>;
}
```

### D4: WAL 模式 + 并发策略

```typescript
// Database.ts
const db = new Database(path, {
  readonly: false,
  fileMustExist: false,
});

// 启用 WAL 模式（并发读）
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');
```

**并发策略:**
- 写操作：单连接，同步执行（better-sqlite3 特性）
- 读操作：WAL 模式下可并发
- 事务：使用 `db.transaction()` 包装

### D5: 迁移策略

```typescript
// MigrationRunner.ts
const migrations = [
  { version: 1, up: initialSchema, down: dropAll },
];

async function migrate(db: Database): Promise<void> {
  // 1. 创建 migrations 表
  // 2. 读取当前版本
  // 3. 执行未应用的迁移
  // 4. 记录版本
}

// JSON → SQLite 迁移脚本
async function migrateFromJson(workspaceDir: string): Promise<void> {
  // 1. 读取所有 JSON 文件
  // 2. 插入到 SQLite
  // 3. 保留原 JSON 作为备份
}
```

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Native 编译失败 | 安装失败 | 提供 prebuild；fallback 到 sql.js |
| 数据库损坏 | 数据丢失 | WAL 模式 + 定期备份；.dump 导出 |
| 迁移数据丢失 | 历史数据丢失 | 保留 JSON 原文件；验证迁移完整性 |
| 文件体积增长 | 磁盘占用 | VACUUM 定期清理；Session TTL 清理 |

**Trade-offs:**
- **可读性 ↓** - 二进制文件无法直接查看
- **调试便利性 ↓** - 需要 SQLite 工具
- **查询能力 ↑** - 复杂查询、索引
- **一致性 ↑** - ACID 事务
- **并发性 ↑** - WAL 模式

## Migration Plan

### Phase 1: 存储层实现（无破坏性）
1. 实现 `Database.ts`、`SessionRepository.ts`、`MemoryRepository.ts`
2. 实现 `MigrationRunner.ts` 和初始 Schema
3. 单元测试覆盖

### Phase 2: 集成切换
1. `SessionStorage` 内部切换到 `SessionRepository`
2. `memory-tools.ts` 切换到 `MemoryRepository`
3. 保持 API 兼容

### Phase 3: 数据迁移
1. 提供 `hive migrate` CLI 命令
2. 读取 JSON → 写入 SQLite → 验证 → 保留 JSON 备份
3. 文档更新

### Rollback
```bash
# 如果 SQLite 有问题，可回退
rm .hive/hive.db
# 恢复使用 JSON（代码保留兼容）
```

## Open Questions

1. **Session 清理策略** - 是否需要自动 VACUUM？频率？
2. **Memory 搜索** - 是否需要 FTS 全文搜索？
3. **备份策略** - 是否自动定期备份？

**建议:** 初期先不实现，观察实际使用后决定。
