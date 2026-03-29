## MODIFIED Requirements

### Requirement: Dispatch classification supports schedule trigger
Dispatcher 的分类系统 SHALL 支持 schedule 类型的分发目标。当定时任务触发时，Dispatcher SHALL 将任务路由到独立会话执行。

#### Scenario: 定时任务触发的分发
- **WHEN** ScheduleEngine 通过回调触发任务执行，传入 `{ prompt, action, scheduleId }`
- **THEN** Dispatcher SHALL 创建独立会话（SessionManager.createSession）
- **THEN** 独立会话的 metadata SHALL 包含 `{ source: 'schedule', scheduleId: '...' }`
- **THEN** Dispatcher SHALL 在独立会话上下文中执行 agent.dispatch(prompt)
- **THEN** 执行完成后 SHALL 返回会话 ID 供 Engine 记录

#### Scenario: 定时任务执行与用户会话隔离
- **WHEN** 定时任务正在执行
- **THEN** 该任务的执行 SHALL 不影响用户当前交互会话
- **THEN** 用户 SHALL 能够同时正常对话
