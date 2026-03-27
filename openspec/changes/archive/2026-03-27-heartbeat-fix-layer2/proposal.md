## Why

Agent 心跳系统存在两个层面的问题：Layer 1（执行中健康监控）有 3 个 bug 导致卡住检测形同虚设；Layer 2（空闲时主动巡检）完全缺失，Agent 无法在无用户请求时主动执行周期性任务。参考 OpenClaw 的 Gateway Heartbeat 机制，需要修补现有 bug 并为宿主应用提供 Layer 2 心跳原语。

## What Changes

**Bug 修复（Layer 1）：**
- `onStalled` 检测到卡住后仅触发 hook 事件，不中断执行 — 增加 `action: 'warn' | 'abort'` 配置，支持自动 abort
- `WorkflowCapability.runWorkflow()` 完全没有心跳/超时保护 — 复用 TimeoutCapability 包装工作流执行
- `chat()` / `chatStream()` 心跳启动/停止逻辑重复 — 提取 `withHeartbeat()` 私有方法消除重复
- `runner.execute()` 子 Agent 无超时保护 — 在 `AgentExecuteOptions` 增加可选 `timeout`
- `stallTimeout` 默认值 60s 对慢模型过短 — 默认值调整为 120s

**新功能（Layer 2）：**
- 新增 `runHeartbeatOnce()` 方法 — SDK 层心跳原语，供宿主应用调度
- 新增 `HeartbeatTaskConfig` / `HeartbeatResult` 类型定义
- 宿主应用可自行实现调度（setInterval / node-cron / agenda 等）

## Capabilities

### New Capabilities
- `heartbeat-task`: Agent 空闲时主动巡检能力 — `runHeartbeatOnce()` 方法及相关类型，供宿主应用调度周期性任务

### Modified Capabilities
- `timeout-monitor`: 执行中健康监控能力 — 修补 onStalled 不中断、WorkflowCapability 缺失、runner 无超时等问题

## Impact

**代码文件：**
- `packages/core/src/agents/core/types.ts` — 新增 HeartbeatTaskConfig/Result，HeartbeatConfig 增加 action 字段
- `packages/core/src/agents/core/Agent.ts` — 新增 runHeartbeatOnce()、withHeartbeat()，重构 chat/chatStream
- `packages/core/src/agents/capabilities/TimeoutCapability.ts` — stallTimeout 默认值调整，支持 abort action
- `packages/core/src/agents/capabilities/WorkflowCapability.ts` — 增加心跳+超时包装
- `packages/core/src/agents/core/runner.ts` — 子 Agent 增加可选超时

**API 变更：**
- `HeartbeatConfig.action` 新增可选字段（默认 `'warn'`，向后兼容）
- `AgentExecuteOptions.timeout` 新增可选字段（向后兼容）
- `Agent.runHeartbeatOnce()` 新增公开方法
- `TimeoutConfig.stallTimeout` 默认值从 60000 改为 120000

**无破坏性变更** — 所有新增字段都有默认值，现有调用方无需修改。
