## 1. 依赖与基础设施

- [x] 1.1 安装 node-cron 依赖（`npm install node-cron`）及类型定义（`@types/node-cron`）
- [x] 1.2 在 packages/core/src/storage/migrations/ 中新增 migration：创建 `schedules` 表和 `schedule_runs` 表
- [x] 1.3 创建 ScheduleRepository（CRUD 操作：create, findAll, findById, update, delete, findByEnabled）

## 2. 数据模型与类型

- [x] 2.1 创建 packages/core/src/scheduler/types.ts，定义 Schedule、ScheduleRun、ScheduleStatus、ScheduleAction 等类型
- [x] 2.2 创建 cron 验证工具函数（validateCron、getNextRunTime）

## 3. ScheduleEngine 实现

- [x] 3.1 创建 packages/core/src/scheduler/ScheduleEngine.ts：构造函数接收 onTrigger 回调和 ScheduleRepository
- [x] 3.2 实现 engine.start()：加载 enabled 任务并注册 node-cron 定时器
- [x] 3.3 实现 engine.stop()：取消所有定时器，等待运行中任务完成
- [x] 3.4 实现 engine.addTask() / pauseTask() / resumeTask() / removeTask()：运行时热管理
- [x] 3.5 实现 engine.getStatus()：返回当前引擎状态
- [x] 3.6 创建 packages/core/scheduler/index.ts 导出

## 4. ScheduleCapability 实现

- [x] 4.1 创建 packages/core/src/agents/capabilities/ScheduleCapability.ts：遵循 Capability 委托模式
- [x] 4.2 实现自然语言意图解析：通过 LLM 将用户消息解析为 `{ cron, prompt, action }` 结构
- [x] 4.3 实现 create()：解析意图 → 验证 cron → 存入数据库 → 通知 Engine 注册
- [x] 4.4 实现 list()：查询所有任务，格式化返回
- [x] 4.5 实现 pause() / resume() / remove()：更新数据库 + 通知 Engine
- [x] 4.6 实现 history()：查询 schedule_runs 记录
- [x] 4.7 在 capabilities/index.ts 中注册 ScheduleCapability

## 5. Agent 集成

- [x] 5.1 在 Agent.ts 中添加 schedule 能力入口
- [x] 5.2 在 agents/index.ts 中导出 ScheduleCapability 相关类型
- [x] 5.3 在 core/src/index.ts 中导出 scheduler 模块

## 6. 独立会话执行

- [x] 6.1 实现宿主 onTrigger 回调：创建独立会话（metadata 标记 source=schedule, scheduleId）→ agent.dispatch(prompt)
- [x] 6.2 执行完成后将会话 ID 和状态写入 schedule_runs 表

## 7. 宿主应用集成

- [x] 7.1 在 server.ts 中初始化 ScheduleEngine 并传入 Agent 回调
- [x] 7.2 在 cli.ts 中初始化 ScheduleEngine（如适用）
- [x] 7.3 在应用关闭时调用 engine.stop()

## 8. 测试

- [x] 8.1 ScheduleRepository 单元测试：CRUD 操作
- [x] 8.2 ScheduleEngine 单元测试：启动加载、触发执行、热管理、优雅关闭
- [x] 8.3 ScheduleCapability 单元测试：意图解析、创建/列表/暂停/删除
- [x] 8.4 集成测试：Capability → SQLite → Engine 全链路
- [x] 8.5 cron 验证工具函数测试
