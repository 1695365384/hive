## Why

Agent 目前只能被动响应用户请求，无法自主定时执行任务。用户需要一个"帮我每天早上检查一下日志"这样的能力，让 Agent 像一个真正的助手一样主动工作。

## What Changes

- 新增 **ScheduleCapability**：Agent 能力模块，用户通过自然语言对话创建/查看/暂停/删除定时任务，LLM 解析自然语言生成 cron 表达式
- 新增 **ScheduleEngine**：独立调度引擎，基于 node-cron 实现后台 cron 调度，读取 SQLite 中的任务配置，到点触发 Agent 执行
- 新增 **schedules 数据表**：在已有 SQLite（.hive/hive.db）中新建 schedules 表，持久化定时任务定义和执行记录
- 定时任务执行时自动创建**独立会话**，结果存储在独立会话中，与用户交互会话隔离
- WorkspacePaths 扩展，支持 schedules 相关路径配置

## Capabilities

### New Capabilities
- `schedule-management`: 定时任务的创建、查看、暂停、恢复、删除等生命周期管理，包括自然语言意图解析和 cron 表达式生成
- `schedule-engine`: 后台 cron 调度引擎，负责任务加载、触发执行、结果记录和文件变更监听

### Modified Capabilities
- `unified-execution-engine`: Dispatcher 需要支持 schedule 类型的分发目标，将定时任务触发路由到独立会话执行

## Impact

- **新增依赖**: `node-cron`（轻量 cron 调度）
- **数据库**: .hive/hive.db 新增 `schedules` 表（需 migration）
- **Agent 接口**: Agent 类新增 `schedule` 能力入口
- **宿主应用**: server.ts / cli.ts 需初始化 ScheduleEngine 并传入 Agent 回调
- **现有模块**: WorkspaceManager（路径扩展）、Dispatcher（可选增强）、SessionManager（独立会话创建）
