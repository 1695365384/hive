## ADDED Requirements

### Requirement: 统一子 Agent 执行入口
系统 SHALL 提供唯一的 Agent 执行引擎 `AgentRunner`，所有子 Agent 调用（explore、plan、general、自定义 Agent）MUST 通过 `AgentRunner.execute()` 或其便捷方法执行。系统 MUST NOT 存在其他直接调用 SDK `query()` 的执行路径。

#### Scenario: 通过 Runner 执行 explore Agent
- **WHEN** 调用 `runner.explore(prompt, thoroughness)`
- **THEN** Runner 使用 explore Agent 配置构建 query options，调用 SDK `query()`，返回 `AgentResult`

#### Scenario: 通过 Runner 执行 general Agent
- **WHEN** 调用 `runner.general(prompt, options)`
- **THEN** Runner 使用 general Agent 配置构建 query options，调用 SDK `query()`，返回 `AgentResult`

### Requirement: 并行执行能力
`AgentRunner` SHALL 提供 `runParallel(tasks, maxConcurrent)` 方法，支持并行执行多个子 Agent 任务，并发数可配置（默认 10）。

#### Scenario: 并行执行多个任务
- **WHEN** 调用 `runner.runParallel([{name: 'a', prompt: '...'}, {name: 'b', prompt: '...'}], 2)`
- **THEN** 最多 2 个任务同时执行，返回 `TaskResult[]`，每个结果包含 name、text、tools、success、duration

#### Scenario: 单个任务快速执行
- **WHEN** 调用 `runner.runTask(prompt, options)`
- **THEN** 创建单个 Task 并执行，返回 `TaskResult`

### Requirement: Chat 执行委托
`AgentRunner` SHALL 提供 `executeChat(prompt, options)` 方法，封装完整的对话执行逻辑（SDK query 调用、消息流处理、超时控制）。`ChatCapability` MUST 委托给 `runner.executeChat()` 而非直接调用 SDK。

#### Scenario: ChatCapability 通过 Runner 执行对话
- **WHEN** `ChatCapability.send(prompt, options)` 被调用
- **THEN** 内部委托给 `runner.executeChat(prompt, options)`，支持 onText、onTool、onThinking 回调

#### Scenario: 超时控制统一
- **WHEN** `executeChat` 或 `execute` 设置了超时
- **THEN** 使用统一的 AbortController + setTimeout 机制，超时后抛出 `TimeoutError`

### Requirement: 移除 Task 类
系统 MUST NOT 包含独立的 `Task` 类。原有 `Task` 的功能 MUST 完全由 `AgentRunner` 的方法覆盖。

#### Scenario: 原 Task.run() 迁移
- **WHEN** 代码之前使用 `new Task(config).run()`
- **THEN** 改为使用 `runner.runTask(config.prompt, config)` 达到相同效果

#### Scenario: 原 runParallel() 迁移
- **WHEN** 代码之前使用 `runParallel(tasks, maxConcurrent)`
- **THEN** 改为使用 `runner.runParallel(tasks, maxConcurrent)` 达到相同效果
