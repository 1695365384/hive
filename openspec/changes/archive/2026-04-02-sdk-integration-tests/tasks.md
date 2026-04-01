## 1. 共享基础设施

- [x] 1.1 创建 `tests/integration/integration-helpers.ts`：智能 AI SDK mock 工厂函数（`createMockAI`），支持纯文本响应、工具调用响应、多轮对话序列，mock 结构严格对齐 `@ai-sdk/openai` 的 `generateText`/`streamText` 返回值
- [x] 1.2 在 `integration-helpers.ts` 中实现 Agent 生命周期管理：`createTestAgent()` 和 `withAgent(callback)` 辅助函数，自动 initialize + dispose
- [x] 1.3 在 `integration-helpers.ts` 中实现场景预设函数：`setupSimpleChat`、`setupToolUseChat`、`setupMultiTurnChat`
- [x] 1.4 在 `integration-helpers.ts` 中实现断言增强函数：`assertToolCalled`、`assertHookFired`、`assertSessionSaved`
- [x] 1.5 扩展 `tests/utils/test-helpers.ts`：增加流式响应 mock helper（`createMockStreamResponse`）和工具调用 mock helper（`createToolCallStep`）
- [x] 1.6 运行 `pnpm test` 验证现有测试不受影响（基础设施仅新增文件，不修改 setup.ts）

## 2. SDK 公开 API 契约测试

- [x] 2.1 创建 `tests/integration/sdk-contract.test.ts`：验证 `index.ts` 所有命名导出存在且类型正确（Agent、createAgent、getAgent、ask、explore、plan、general、runWorkflow 等）
- [x] 2.2 实现 Agent 构造函数测试：无参构造、`createAgent()` 工厂函数、`initialize()` 后方法可用
- [x] 2.3 实现 Agent 公开方法存在性测试：chat、explore、plan、general、runWorkflow、dispatch、listProviders、useProvider、listSkills、createSession、loadSession、listSessions
- [x] 2.4 实现便捷函数可调用测试：ask、explore、plan、general 在 mock 环境下不抛异常
- [x] 2.5 运行测试验证通过

## 3. 完整对话链路集成测试

- [x] 3.1 创建 `tests/integration/full-conversation.test.ts`，使用 `integration-helpers.ts` 的智能 mock
- [x] 3.2 实现纯文本 chat 测试：用户输入 → LLM 纯文本响应 → 验证返回文本 + session 消息记录
- [x] 3.3 实现工具调用 chat 测试：用户输入 → LLM 返回 toolCall → Agent 执行工具 → 返回最终响应
- [x] 3.4 实现多轮对话上下文测试：连续两次 chat，验证第二次 LLM 调用包含第一次对话历史
- [x] 3.5 实现 tool:before/after hook 触发验证测试：验证 hook context 包含 toolName 和 args
- [x] 3.6 实现 session 自动创建测试：首次 chat 后 `agent.currentSession` 不为 null
- [x] 3.7 运行测试验证通过

## 4. 子 Agent 协作集成测试

- [x] 4.1 创建 `tests/integration/sub-agent.test.ts`
- [x] 4.2 实现 Explore agent 测试：调用 `agent.explore()`，验证使用只读工具（file/glob/grep/web），不使用 bash
- [x] 4.3 实现 Plan agent 测试：调用 `agent.plan()`，验证使用只读工具
- [x] 4.4 实现 General agent 测试：调用 `agent.general()`，验证可使用所有工具包括 bash
- [x] 4.5 实现子 Agent 结果返回验证：执行完成后结果文本返回给调用方
- [x] 4.6 运行测试验证通过

## 5. 工作流引擎集成测试

- [x] 5.1 创建 `tests/integration/workflow.test.ts`
- [x] 5.2 实现基础 workflow 执行测试：`runWorkflow({ task: 'test' })` 返回 WorkflowResult
- [x] 5.3 实现 workflow:phase hook 触发验证测试
- [x] 5.4 实现 workflow 中工具调用链路验证测试
- [x] 5.5 实现 maxTurns 限制测试：设置 maxTurns: 2，验证最多执行 2 轮
- [x] 5.6 运行测试验证通过

## 6. 自定义 Provider 集成测试

- [x] 6.1 创建 `tests/integration/custom-provider.test.ts`
- [x] 6.2 实现自定义 Provider 注册和使用测试：useProvider 切换后 chat 使用新 Provider
- [x] 6.3 实现 Provider 切换行为验证测试：切换后 generateText mock 收到新 Provider 的 model 配置
- [x] 6.4 实现多 Agent 实例 Provider 隔离测试
- [x] 6.5 实现不存在 Provider 返回 false 测试
- [x] 6.6 运行测试验证通过

## 7. 会话恢复续聊集成测试

- [x] 7.1 创建 `tests/integration/session-resume.test.ts`，使用真实 SQLite（参考 sqlite-persistence.test.ts 模式）
- [x] 7.2 实现 chat 自动持久化测试：chat 后 session 写入 SQLite，包含 user + assistant 消息
- [x] 7.3 实现加载 session 继续对话测试：loadSession 后 chat，LLM 收到完整历史
- [x] 7.4 实现 listSessions 测试：返回历史 session 列表
- [x] 7.5 实现 resumeLastSession 测试：加载最近 session 继续对话
- [x] 7.6 运行测试验证通过

## 8. 定时任务端到端集成测试

- [x] 8.1 创建 `tests/integration/schedule-e2e.test.ts`
- [x] 8.2 实现定时任务创建测试：通过 ScheduleCapability API 创建 Schedule 对象
- [x] 8.3 实现任务列表管理测试：列出/删除定时任务
- [x] 8.4 实现无效 cron 表达式拒绝测试
- [x] 8.5 实现任务触发执行测试：模拟触发时间到达，验证 prompt 被执行
- [x] 8.6 运行测试验证通过

## 9. 现有测试 Mock 质量提升

- [x] 9.1 增强 `agent-hooks.test.ts`：引入智能 mock，增加 tool:before/after hook 实际触发验证用例
- [x] 9.2 增强 `agent-provider.test.ts`：引入智能 mock，增加 Provider 切换后 chat 行为验证用例
- [x] 9.3 增强 `agent-skill.test.ts`：引入智能 mock，增加技能匹配后在 chat 中被使用的验证用例
- [x] 9.4 增强 `session-compression.test.ts`：增加压缩阈值触发验证用例
- [x] 9.5 运行全量测试 `pnpm test` 验证所有测试通过，无回归

## 10. 最终验证

- [x] 10.1 运行 `pnpm test` 确认所有测试通过
- [x] 10.2 检查测试覆盖率 `npx vitest run --coverage`，确认 core 覆盖率不低于现有水平
- [x] 10.3 确认新增测试文件都被 vitest.config.ts include 覆盖（`tests/**/*.test.ts` 排除 `tests/e2e/**`）
