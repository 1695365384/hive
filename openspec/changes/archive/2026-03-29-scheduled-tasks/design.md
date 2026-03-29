## Context

Hive 的 Agent 系统目前是纯被动响应模式——用户发消息，Agent 处理。缺少定时/周期性任务执行能力。用户需要一个"每天早上帮我做 X"的能力。

现有架构关键点：
- Agent 是唯一入口，所有功能通过 Capability 模块暴露
- `.hive/hive.db` (SQLite) 已存在，用于会话持久化
- WorkspaceManager 管理 `.hive` 目录结构
- TimeoutCapability 已有 `setInterval` 心跳机制（Agent.ts:489 明确指出调度由宿主负责）
- Orchestrator 层有 Scheduler，但那是 Agent 池路由，不是时间调度

## Goals / Non-Goals

**Goals:**
- 用户通过自然语言对话创建定时任务（"每天9点检查日志"）
- 任务持久化到 SQLite，进程重启后自动恢复
- 执行时创建独立会话，结果与用户交互会话隔离
- 支持创建、查看、暂停、恢复、删除任务

**Non-Goals:**
- 分布式调度 / 多实例协调（单进程足够）
- 任务执行失败重试策略（首期不做）
- 复杂的 cron 可视化编辑器
- 任务依赖链 / DAG 编排

## Decisions

### D1: 两层架构 — Capability + Engine 分离

```
用户对话 → ScheduleCapability (CRUD + NLP解析)
               │ 写入 SQLite
               ▼
           schedules 表
               │ 读取
               ▼
宿主应用启动 → ScheduleEngine (cron调度 + 触发回调)
               │
               ▼
           agent.dispatch() → 独立会话执行
```

**选择理由**: Capability 生命周期绑定 Agent 会话，而 cron 引擎需要独立于会话长期运行。拆分后各自职责清晰。

**备选方案**:
- 全放 Capability → 引擎随 Agent 销毁，定时任务中断 ❌
- 全放 Orchestrator → SDK 纯使用者无法用定时任务 ❌

### D2: SQLite 存储（复用已有 hive.db）

**选择理由**: 项目已有 SQLite 基础设施（DatabaseManager、MigrationRunner、SessionRepository），新增一张 schedules 表即可。无需引入额外存储。

**备选方案**:
- JSON 文件 → 并发写入不安全，查询不便 ❌
- Redis → 增加外部依赖，单机场景过重 ❌

### D3: node-cron 作为调度器

**选择理由**: 轻量（<50KB）、纯 JS、API 简单、社区成熟。Node.js 生态标准选择。

**备选方案**:
- agenda.js → 需要 MongoDB，过重 ❌
- bull → 需要 Redis，过重 ❌
- 自研 cron 解析 + setInterval → 重复造轮子 ❌

### D4: LLM 生成 cron 表达式

用户说自然语言，LLM 在 Capability 层将意图转为结构化 `{ cron, prompt, action }`，存入数据库。

**实现方式**: 通过 system prompt 指导 LLM 输出 JSON 格式的任务定义，包含 cron 表达式和执行 prompt。解析失败时回退要求用户确认。

### D5: 独立会话存储执行结果

每次定时触发创建新会话（SessionManager.createSession），会话 metadata 标记 `source: 'schedule', scheduleId: '...'`。用户可通过 Agent 查看历史执行结果。

### D6: Engine 文件监听机制

ScheduleEngine 启动时加载所有 enabled 任务注册 cron。新增/修改任务通过 `fs.watch` 或 Capability 直接调用 Engine API 热加载。首期用 Capability 直接调用 Engine API（同进程），更简单可靠。

## Risks / Trade-offs

- **[LLM cron 准确性]** → 复杂 cron 表达式（如"每月最后一个周五"）LLM 可能生成错误 → 提供 cron 验证工具函数，生成后校验下次执行时间是否符合预期
- **[进程重启间隔]** → 重启期间错过的任务不会补执行 → 首期接受，后续可加 missed-fire 检测
- **[长时间运行的 Agent 实例]** → 如果 server 进程长期运行，node-cron 的定时器会持续存在 → ScheduleEngine 提供 `stop()` 方法，宿主应用在关闭时调用
- **[SQLite 并发]** → 多个定时任务同时触发写入 → SQLite WAL 模式已支持并发读，写锁短暂阻塞可接受
