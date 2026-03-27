## Why

当前 Hive 使用 JSON 文件存储会话数据，Memory 工具使用纯内存存储（进程重启丢失）。随着会话数量增长，JSON 文件方案面临查询效率低、并发写入困难、Memory 无法持久化等问题。`better-sqlite3` 已在依赖中但未使用，本次变更将其激活。

## What Changes

- 新增 SQLite 存储层，替换现有 JSON 文件存储
- Session 存储从 `sessions/*.json` 迁移到 SQLite
- Memory 工具从纯内存存储迁移到 SQLite 持久化
- 提供数据迁移脚本，支持从 JSON 平滑迁移
- 保持向后兼容，JSON 文件仍可读取

## Capabilities

### New Capabilities

- `sqlite-storage`: SQLite 数据库管理能力 - 连接池、事务、迁移
- `session-repository`: Session 数据的 CRUD 操作接口
- `memory-repository`: Memory 数据的持久化存储接口

### Modified Capabilities

无现有 spec 需要修改。这是新增存储后端实现。

## Impact

**代码影响:**
- `packages/core/src/session/SessionStorage.ts` - 重构为 Repository 模式
- `packages/core/src/tools/memory-tools.ts` - 迁移到 SQLite
- `packages/core/src/workspace/WorkspaceManager.ts` - 更新路径管理

**新增文件:**
- `packages/core/src/storage/` - SQLite 存储层
- `packages/core/src/storage/migrations/` - Schema 迁移脚本

**依赖:**
- `better-sqlite3` - 已安装，开始使用
- `@types/better-sqlite3` - 已安装

**兼容性:**
- 保持 `SessionStorage` 接口不变
- 提供 JSON → SQLite 迁移工具
