## Context

日志系统已迁移到 pino，日志文件按 `hive-YYYY-MM-DD.log` 格式存储在 `~/.hive/logs/`，支持日切割和大小切割（`hive-YYYY-MM-DD.N.log`）。当前前端只能通过 `log.tail` 拉取 LogBuffer 中的实时日志，无法查看历史。

## Goals / Non-Goals

**Goals:**
- 用户可在桌面端按日期浏览历史日志
- Server 提供按日期读取日志文件的 API
- 前端日期切换流畅，不阻塞 UI

**Non-Goals:**
- 不做全文搜索（后续可加）
- 不做日志文件导出/下载
- 不修改日志存储格式

## Decisions

### 1. 读取方式：直接解析日志文件

日志文件每行是一个 JSON 对象（pino 默认输出），解析成本低。无需引入额外依赖。

**替代方案**：维护 SQLite 日志索引 → 过度设计，文件量不大。

### 2. API 设计：两个新 WS 方法

- `log.listDates` → 返回 `string[]`（有日志的日期列表，如 `["2026-03-30", "2026-03-31"]`）
- `log.getByDate({ date, limit?, offset? })` → 返回 `LogEntry[]`

复用现有 `LogEntry` 类型，前端无需新增数据结构。

### 3. 前端交互：日期选择器在日志抽屉顶部

- 默认显示"今天"，走实时轮询（`log.tail`）
- 选择历史日期时，暂停轮询，显示该日期的日志
- 选回"今天"时恢复轮询

### 4. 大文件处理：分页读取

单个日志文件可能较大（maxFileSize=50MB），`log.getByDate` 支持 `limit` + `offset` 分页，默认返回最新 200 条。

## Risks / Trade-offs

- **[大文件读取延迟]** → 分页 + 限制默认返回数量，避免一次读取过大文件
- **[并发读取]** → 日志文件是 append-only，读取时无锁风险
