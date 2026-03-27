## 1. 类型定义更新

- [x] 1.1 在 `types.ts` 的 `HeartbeatConfig` 中增加 `action?: 'warn' | 'abort'` 字段，默认 `'warn'`
- [x] 1.2 在 `types.ts` 的 `AgentExecuteOptions` 中增加 `timeout?: number` 字段
- [x] 1.3 在 `types.ts` 中新增 `HeartbeatTaskConfig` 接口（interval, prompt?, model?, lightContext?, onResult?）
- [x] 1.4 在 `types.ts` 中新增 `HeartbeatResult` 接口（isOk, hasAlert, content, usage?）
- [x] 1.5 在 `types.ts` 的重导出区域导出 `HeartbeatTaskConfig` 和 `HeartbeatResult`

## 2. TimeoutCapability 修复

- [x] 2.1 将 `DEFAULT_TIMEOUT_CONFIG.stallTimeout` 从 `60000` 改为 `120000`
- [x] 2.2 在 `startHeartbeat` 中将 `AbortController` 作为参数传入或存储在 heartbeatState 中，供 abort action 使用
- [x] 2.3 在 stall 检测逻辑中，当 `config.action === 'abort'` 时，通过 AbortController 中断执行并抛出 `TimeoutError`

## 3. Agent 心跳重构

- [x] 3.1 提取 `Agent` 类的 `private withHeartbeat<T>(promise, options)` 方法，封装 startHeartbeat + withTimeout + stopHeartbeat
- [x] 3.2 重构 `Agent.chat()` 使用 `withHeartbeat()` 替换内联心跳逻辑
- [x] 3.3 重构 `Agent.chatStream()` 使用 `withHeartbeat()` 替换内联心跳逻辑
- [x] 3.4 在 `withHeartbeat()` 中将 `HeartbeatConfig.action` 传递给 `startHeartbeat()`

## 4. WorkflowCapability 超时保护

- [x] 4.1 在 `WorkflowCapability` 的执行方法中，使用 `timeoutCap.startHeartbeat()` 包装工作流执行
- [x] 4.2 使用 `timeoutCap.withTimeout()` 包装工作流 Promise，设置 `executionTimeout`
- [x] 4.3 在 finally 块中调用 `timeoutCap.stopHeartbeat()`

## 5. 子 Agent 超时

- [x] 5.1 在 `runner.ts` 的 `executeWithConfig()` 中读取 `options?.timeout`
- [x] 5.2 当 timeout 有值时，创建 `AbortController` 并用 `Promise.race` 实现超时
- [x] 5.3 超时时返回 `AgentResult { success: false, error: 'Sub-agent timed out' }`

## 6. Layer 2 心跳原语

- [x] 6.1 在 `Agent` 类中实现 `runHeartbeatOnce(config?: HeartbeatTaskConfig): Promise<HeartbeatResult>`
- [x] 6.2 默认 prompt: `"Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. If nothing needs attention, reply HEARTBEAT_OK."`
- [x] 6.3 解析 agent 回复：以 `HEARTBEAT_OK` 开头则 `isOk: true`，否则 `hasAlert: true`
- [x] 6.4 调用 `config.onResult?.(result)` 回调

## 7. 测试

- [x] 7.1 为 `HeartbeatConfig.action = 'abort'` 编写单元测试：验证 abort 时抛出 TimeoutError
- [x] 7.2 为 `AgentExecuteOptions.timeout` 编写单元测试：验证子 Agent 超时返回错误
- [x] 7.3 为 `runHeartbeatOnce()` 编写单元测试：验证 HEARTBEAT_OK 解析和 alert 检测
- [x] 7.4 为 `withHeartbeat()` 重构编写测试：验证 chat/chatStream 心跳行为一致
- [x] 7.5 为 WorkflowCapability 超时保护编写集成测试
