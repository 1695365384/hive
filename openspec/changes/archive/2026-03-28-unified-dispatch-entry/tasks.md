## 1. 删除流式 API

- [x] 1.1 Agent.ts 删除 `chatStream()` 方法
- [x] 1.2 ChatCapability.ts 删除 `sendStream()` 方法
- [x] 1.3 heartbeat-wrapper.ts 简化，移除 stream 相关逻辑
- [x] 1.4 CLI (packages/core/src/cli.ts) 删除 chatStream 调用分支

## 2. 统一执行入口

- [x] 2.1 Agent.chat() 内部改为 `dispatch({ forceLayer: 'chat' })` + withHeartbeat 包装，返回 result.text
- [x] 2.2 Agent.swarm() 保持直调 swarmCap（返回类型 SwarmResult 与 DispatchResult 不兼容）
- [x] 2.3 Agent.pipeline() 保持直调 PipelineExecutor（接受 stages 编排参数）
- [x] 2.4 Agent.runWorkflow() 保持直调 workflowCap（返回类型 WorkflowResult 与 DispatchResult 不兼容）
- [x] 2.5 确保各方法的返回值类型与原签名一致

## 3. 清理流式测试

- [x] 3.1 with-heartbeat.test.ts 删除 chatStream 相关 describe 和测试用例
- [x] 3.2 chat-capability.test.ts 删除 sendStream() describe 和测试用例
- [x] 3.3 e2e/agent-real.test.ts 删除 chatStream 测试
- [x] 3.4 e2e/provider-real.test.ts 删除 chatStream 测试

## 4. 验证

- [x] 4.1 TypeScript 编译通过 (`npm run build`)
- [x] 4.2 单元测试全部通过 (`npx vitest run packages/core/tests/unit/`)
- [x] 4.3 E2E 测试通过（非流式部分）
