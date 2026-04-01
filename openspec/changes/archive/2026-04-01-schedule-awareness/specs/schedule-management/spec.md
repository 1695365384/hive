## MODIFIED Requirements

### Requirement: ScheduleCapability 作为 Agent 能力注册
ScheduleCapability SHALL 作为 Agent 的标准能力模块，遵循 Capability 委托模式。

#### Scenario: Capability 初始化
- **WHEN** Agent 初始化时启用 ScheduleCapability
- **THEN** Capability SHALL 接收 AgentContext 和 ScheduleRepository 依赖
- **THEN** Capability SHALL 可通过 `agent.getCapability('schedule')` 访问

#### Scenario: Agent 在对话中感知定时任务能力
- **WHEN** DynamicPromptBuilder 构建 system prompt 时
- **THEN** Builder SHALL 加载 `schedule-awareness` 模板作为独立 section
- **THEN** 模板 SHALL 声明 Agent 具备创建、查询、暂停、恢复、删除定时任务的能力
- **THEN** 模板 SHALL 说明三种调度模式（cron / every / at）的适用场景
- **THEN** 模板 SHALL 提示 Agent 在用户表达周期性需求时主动建议创建定时任务

#### Scenario: Agent 在对话中感知已有定时任务
- **WHEN** ChatCapability 构建 PromptBuildContext 时
- **THEN** ChatCapability SHALL 查询 ScheduleRepository 获取当前已有任务列表
- **THEN** ChatCapability SHALL 将任务列表格式化为摘要（名称 + 调度模式 + 状态）
- **THEN** ChatCapability SHALL 将摘要填入 `PromptBuildContext.scheduleSummary`
- **THEN** DynamicPromptBuilder SHALL 将 scheduleSummary 嵌入 schedule section

#### Scenario: 无已有定时任务
- **WHEN** ScheduleRepository 返回空列表
- **THEN** scheduleSummary SHALL 为空字符串或包含"当前无定时任务"的提示
- **THEN** schedule section SHALL 仍然注入能力声明，只是不包含任务列表

#### Scenario: Token budget 不足时裁剪 schedule section
- **WHEN** system prompt 总长度超过 maxChars 预算
- **THEN** schedule section SHALL 按 priority 4 被裁剪（与 skill section 同级）
- **THEN** base/language/task/environment section SHALL 不受影响
