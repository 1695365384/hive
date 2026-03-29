## MODIFIED Requirements

### Requirement: 统一子 Agent 执行入口
系统 SHALL 提供唯一的 Agent 执行引擎 `AgentRunner`，所有子 Agent 调用（explore、plan、general、自定义 Agent）MUST 通过 `AgentRunner.execute()` 或其便捷方法执行。系统 MUST NOT 存在其他直接调用 SDK `query()` 的执行路径。

高层执行方法 SHALL 只有两层：`chat()` 和 `runWorkflow()`。系统 MUST NOT 包含 `swarm()` 或 `pipeline()` 方法。Dispatcher 分类 MUST 只区分 `chat` 和 `workflow` 两种 ExecutionLayer。

#### Scenario: 通过 Runner 执行 explore Agent
- **WHEN** 调用 `runner.explore(prompt, thoroughness)`
- **THEN** Runner 使用 explore Agent 配置构建 query options，调用 SDK `query()`，返回 `AgentResult`

#### Scenario: 通过 Runner 执行 general Agent
- **WHEN** 调用 `runner.general(prompt, options)`
- **THEN** Runner 使用 general Agent 配置构建 query options，调用 SDK `query()`，返回 `AgentResult`

#### Scenario: chat() 通过 dispatch 执行
- **WHEN** 调用 `agent.chat(prompt, options)`
- **THEN** 内部调用 `dispatch(prompt, { forceLayer: 'chat', cwd: options?.cwd })`，返回 `result.text`

#### Scenario: runWorkflow() 通过 dispatch 执行
- **WHEN** 调用 `agent.runWorkflow(prompt, workflowOptions)`
- **THEN** 内部调用 `dispatch(prompt, { forceLayer: 'workflow', ... })`，返回 `WorkflowResult`

### Requirement: Heartbeat 只保护 Chat 层
`chat()` 方法 SHALL 在 dispatch 调用外层包装 `withHeartbeat`。`runWorkflow()` MUST NOT 包装 heartbeat。

#### Scenario: chat 调用包含 heartbeat
- **WHEN** 调用 `agent.chat(prompt)`
- **THEN** dispatch 返回的 Promise 被 withHeartbeat 包装，具备会话级心跳保护

#### Scenario: runWorkflow 调用不包含 heartbeat
- **WHEN** 调用 `agent.runWorkflow(prompt)`
- **THEN** 直接调用 workflowCap.run()，无 heartbeat 包装（workflow 内部自行管理超时）

## ADDED Requirements

### Requirement: Workflow 三子 Agent 顺序执行
`WorkflowCapability.run()` 对于 moderate/complex 任务 SHALL 按顺序执行三个子 Agent：explore（只读探索）→ plan（制定方案）→ execute（读写执行）。每个阶段的输出 SHALL 通过 prompt 拼接传递给下一阶段。

#### Scenario: moderate/complex 任务执行完整三阶段
- **WHEN** 调用 `workflowCap.run(task)` 且 `analyzeTask()` 返回 `type: 'moderate'` 或 `type: 'complex'`
- **THEN** 依次调用 `subAgentCap.explore(task)` → `subAgentCap.plan(task + exploreResult)` → `subAgentCap.general(task + exploreResult + planResult)`，返回包含三个阶段结果的 `WorkflowResult`

#### Scenario: simple 任务跳过 explore/plan
- **WHEN** 调用 `workflowCap.run(task)` 且 `analyzeTask()` 返回 `type: 'simple'`
- **THEN** 直接调用 `runner.execute('general', prompt)`，跳过 explore 和 plan 阶段

#### Scenario: explore 阶段结果传递给 plan
- **WHEN** explore 阶段完成
- **THEN** explore 的文本输出 SHALL 作为上下文拼入 plan 的 prompt 中

#### Scenario: explore 和 plan 结果传递给 execute
- **WHEN** plan 阶段完成
- **THEN** explore 和 plan 的文本输出 SHALL 作为上下文拼入 execute 的 prompt 中

#### Scenario: workflow 阶段通过 onPhase 回调报告
- **WHEN** workflow 执行过程中
- **THEN** 每个阶段开始时 MUST 调用 `onPhase('explore'|'plan'|'execute', message)` 回调

### Requirement: analyzeTask 增强判断
`WorkflowCapability.analyzeTask()` SHALL 区分 simple（纯问答）和 moderate/complex（需要探索和执行的任务）。

#### Scenario: 短问答判定为 simple
- **WHEN** 输入为短文本（<100 字符）且以问号结尾且无换行
- **THEN** 返回 `type: 'simple'`

#### Scenario: 非问答任务判定为 moderate
- **WHEN** 输入不满足 simple 条件
- **THEN** 返回 `type: 'moderate'`，`needsExploration: true`，`needsPlanning: true`

## REMOVED Requirements

### Requirement: swarm() 通过 dispatch 执行
**Reason**: swarm DAG 编排系统整体删除，不再需要 swarm 执行路径
**Migration**: 复杂任务统一使用 `agent.runWorkflow()` 或 `agent.dispatch({ forceLayer: 'workflow' })`

### Requirement: swarm 调用不包含 heartbeat
**Reason**: swarm 层整体删除
**Migration**: 无需迁移

### Requirement: 并行执行能力
**Reason**: DAG 删除后不再需要并行节点执行。如需并行可通过 Promise.all 在 workflow 内实现
**Migration**: 无需迁移，当前所有模板都是链式执行

### Requirement: Chat 执行委托（流式部分）
**Reason**: 前一 change 已移除流式 API，此需求已过时
**Migration**: 如需流式，在 Gateway 层（WebSocket SSE）实现
