## Context

Hive 的定时任务系统（scheduled-tasks，已归档）已实现基础 CRUD + cron 调度 + 独立会话执行。但存在两个核心缺陷：

1. **执行结果是"死胡同"**：ScheduleEngine 触发 `agent.chat(prompt)` 后，结果仅写入 `schedule_runs` 表，用户无法感知任务执行状态
2. **Agent 无法自主调度**：只能由用户通过自然语言显式创建任务，Agent 缺乏"时间维度规划"能力

调研 OpenClaw 后发现其 cron 系统采用 JSON 文件存储 + 三种调度模式（at/every/cron）+ bestEffort 推送策略 + consecutiveErrors 熔断，设计简洁实用。本设计融合 OpenClaw 的优点，同时保留 Hive 的 SQLite 并发优势。

## Goals / Non-Goals

**Goals:**
- 定时任务执行结果通过 Channel（飞书等）推送给用户
- 支持三种调度模式：cron、every（固定间隔）、at（一次性定时）
- 一次性任务执行后自动清理，避免僵尸任务
- 连续失败熔断：自动暂停 + 通知用户
- Agent 可通过自然语言自主建议并创建定时任务（带关键词预过滤 + 用户确认）
- Agent 可通过编程接口直接操作任务（精确控制，无幻觉风险）
- 离线 channel 不可用时静默跳过（bestEffort）

**Non-Goals:**
- 离线消息队列或持久化推送（WS 离线不考虑）
- Agent 静默创建任务（所有 auto 任务必须用户确认）
- 工作流编排（任务链/依赖关系）
- 推送重试策略（bestEffort 失败即放弃）

## Decisions

### D1: 存储层 — SQLite 扩展而非替换

**决策**：在现有 `schedules` 表上新增列，而非新建表。

**理由**：现有 SQLite 方案并发安全、查询灵活。OpenClaw 用 JSON 文件是因为单实例单进程场景，Hive 需要多实例安全。

**新增字段**：
```sql
ALTER TABLE schedules ADD COLUMN schedule_kind TEXT DEFAULT 'cron';
ALTER TABLE schedules ADD COLUMN interval_ms INTEGER;
ALTER TABLE schedules ADD COLUMN run_at TEXT;
ALTER TABLE schedules ADD COLUMN delete_after_run INTEGER DEFAULT 0;
ALTER TABLE schedules ADD COLUMN consecutive_errors INTEGER DEFAULT 0;
ALTER TABLE schedules ADD COLUMN notify_config TEXT; -- JSON: { mode, channel, to, bestEffort }
ALTER TABLE schedules ADD COLUMN source TEXT DEFAULT 'user';
ALTER TABLE schedules ADD COLUMN auto_created_by TEXT;
```

**调度逻辑**：`schedule_kind` 决定调度方式，`cron` 字段仅当 `schedule_kind='cron'` 时生效。

### D2: 调度引擎 — 自研时间计算而非 node-cron

**决策**：对 `every` 和 `at` 模式使用自研的 `computeNextRunAtMs()`，`cron` 模式保留 node-cron。

**理由**：
- node-cron 只支持 cron 表达式，不支持 `every`（间隔）和 `at`（绝对时间）
- OpenClaw 使用 `croner` 库但自己实现了 nextRun 计算，我们保持同样策略
- 自研计算逻辑简单（<100 行），无需引入新依赖

```
schedule_kind='cron'  → node-cron 定时器（现有）
schedule_kind='every' → setInterval + 精确 nextRunAt 计算
schedule_kind='at'    → setTimeout + 精确到期时间
```

### D3: 推送通知 — Bus 事件驱动

**决策**：通过 MessageBus 事件实现推送，不引入新的 NotificationService。

**事件流**：
```
ScheduleEngine.onTrigger() → 执行 agent.chat()
  → bus.emit('schedule:completed', { scheduleId, result, status, notifyConfig })
  → bootstrap subscriber 监听
  → bus.publish('message:response', { channelId, chatId, content })
  → 对应 Channel.send() 推送给用户
```

**bestEffort 逻辑**：
```
resolveNotifyTarget(notifyConfig):
  if notifyConfig.bestEffort && channel不可用 → 跳过，不报错
  else if notifyConfig.mode === 'announce' → 推送
  else → 静默（不推送）
```

### D4: Agent 自主创建 — 四层防幻觉

**决策**：关键词预过滤 → LLM 结构化输出 → 代码校验 → 用户确认。

```
Layer 1: 关键词预过滤（零成本）
  触发词: "每天/每周/每隔/定期/监控/提醒/推送/cron/定时"
  不匹配 → 跳过，正常处理对话

Layer 2: LLM 结构化输出 + JSON Schema 校验
  输出: { name, scheduleKind, cron/everyMs/RunAt, prompt, notifyConfig }
  校验: scheduleKind 合法性、cron/interval 合法性、频率上限、数量上限

Layer 3: 用户确认（人兜底）
  Agent 返回确认卡片，等用户确认后创建

Layer 4: 运行时熔断（事后止损）
  consecutiveErrors ≥ 3 → 自动暂停 + 通知用户
  deleteAfterRun → 执行后自动删除
```

### D5: Agent 直接操作 — ScheduleRepository 注入

**决策**：将 ScheduleRepository 暴露给 Agent 上下文，Agent 可通过编程接口精确操作任务。

```typescript
// Agent 上下文中可用
const repo = context.getDependency<IScheduleRepository>();
await repo.create({ name: '监控', scheduleKind: 'every', everyMs: 300000, ... });
```

**理由**：OpenClaw 让 Agent 直接操作 `jobs.json`，我们让 Agent 直接操作 Repository。这绕过了 LLM 解析层，消除幻觉风险。适合 Agent 在工作流中精确控制任务生命周期。

### D6: 推送目标 — 使用 "last" 策略

**决策**：当用户未指定推送目标时，默认推送到"最后交互的 Channel + chatId"。

**实现**：在 `bootstrap.ts` 的 `message:received` subscriber 中，记录 `{ sessionId → { channelId, chatId }` 映射。创建任务时 `notifyConfig.channel = "last"`。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| LLM 生成错误的调度参数 | Layer 2 JSON Schema 校验 + Layer 3 用户确认 |
| Agent 频繁自主创建任务 | 单用户上限 50 个 auto 任务 + 用户必须确认 |
| 推送目标 channel 不可用 | bestEffort 静默跳过 |
| `every` 模式长时间运行累积误差 | 使用 anchor 时间戳 + nextRunAtMs 重新计算 |
| `at` 一次性任务过期后仍触发 | 到期时间已过时 `computeNextRunAtMs` 返回 undefined，不注册 |

## Migration Plan

1. 创建 migration `003-schedules-v2.ts`：ALTER TABLE 新增列
2. 迁移现有 cron 任务：`schedule_kind='cron'`，其他字段保持默认值
3. 无需数据回滚（新增列都有默认值）
