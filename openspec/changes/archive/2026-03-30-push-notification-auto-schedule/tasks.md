## 1. 存储层扩展

- [x] 1.1 创建 migration `003-schedules-v2.ts`：ALTER TABLE 新增 schedule_kind、interval_ms、run_at、delete_after_run、consecutive_errors、notify_config、source、auto_created_by 列
- [x] 1.2 扩展 `Schedule` 类型定义：新增 ScheduleKind、NotifyConfig、consecutiveErrors、deleteAfterRun、source、autoCreatedBy 字段
- [x] 1.3 适配 ScheduleRepository：create/update/query 方法支持新字段

## 2. 调度引擎增强

- [x] 2.1 实现 `computeNextRunAtMs(task)` 函数：支持 cron（node-cron）、every（anchor + interval）、at（绝对时间）三种模式的下次执行时间计算
- [x] 2.2 重构 ScheduleEngine.start()：根据 schedule_kind 注册不同调度器（cron/node-cron、every/setInterval、at/setTimeout）
- [x] 2.3 实现一次性任务自动清理：执行成功 + deleteAfterRun=true 时删除任务
- [x] 2.4 实现连续失败熔断：consecutiveErrors ≥ 3 时自动暂停 + 发送 `schedule:circuit-break` 事件
- [x] 2.5 执行完成后发送 `schedule:completed` 事件（携带 scheduleId、result、status、consecutiveErrors、notifyConfig）
- [x] 2.6 适配 addTask/pauseTask/resumeTask/removeTask 支持 three schedule kinds

## 3. 推送通知系统

- [x] 3.1 在 bootstrap.ts 注册 `message:received` subscriber，记录 session → { channelId, chatId } 映射
- [x] 3.2 实现 resolveNotifyTarget(notifyConfig)：解析推送目标（支持 channel='last' 策略）
- [x] 3.3 在 bootstrap.ts 注册 `schedule:completed` subscriber，将执行结果路由到 Channel
- [x] 3.4 实现 bestEffort 逻辑：channel 不可用时静默跳过

## 4. Agent 自主创建定时任务

- [x] 4.1 实现关键词预过滤：匹配 "每天/每周/每隔/定期/监控/提醒/推送/cron/定时" 触发词
- [x] 4.2 实现 LLM 结构化输出：生成 { name, scheduleKind, cron/everyMs/runAt, prompt, NotifyConfig }
- [x] 4.3 实现 JSON Schema 校验：scheduleKind 合法性、cron 语法、interval 范围、频率上限、数量上限（50）
- [x] 4.4 实现用户确认流程：返回确认卡片，用户确认后创建任务（source='auto'）
- [x] 4.5 ScheduleCapability 创建任务时自动填充 source 和 autoCreatedBy 字段

## 5. Agent 直接操作接口

- [x] 5.1 将 IScheduleRepository 注册到 AgentContext 依赖注入容器
- [x] 5.2 在统一执行引擎 spec 中添加 ScheduleRepository 注入说明

## 6. 测试

- [x] 6.1 单元测试：computeNextRunAtMs 三种调度模式
- [x] 6.2 单元测试：一次性任务自动清理逻辑
- [x] 6.3 单元测试：连续失败熔断逻辑
- [x] 6.4 单元测试：关键词预过滤
- [x] 6.5 单元测试：JSON Schema 校验（合法/非法参数）
- [x] 6.6 单元测试：resolveNotifyTarget（last 策略、bestEffort）
- [x] 6.7 集成测试：端到端创建 → 调度 → 推送流程
