## Context

hive-core 的测试分为三层：unit（mock 一切）、integration（mock AI SDK，其余真实）、e2e（真实 LLM API）。

当前 integration 层有 7 个文件，但覆盖面有限：
- `agent-flow.test.ts` — 只验证模块导出，不验证运行时行为
- `agent-hooks.test.ts` — 只验证 hook 能注册，不验证 hook 被正确触发
- `agent-provider.test.ts` — Provider 切换后无法验证 chat 行为变化
- `agent-skill.test.ts` — 技能匹配无法验证 LLM 真实使用
- `session-compression.test.ts` — TokenCounter 测试偏单元级
- `sqlite-persistence.test.ts` — 已用真实 SQLite，质量好
- `tool-system.test.ts` — 已用真实文件系统，质量好

根本原因：`setup.ts` 全局 mock 的 AI SDK 返回 `{ text: 'Mock response', steps: [] }`，steps 永远为空，导致工具调用链路完全无法测试。

## Goals / Non-Goals

**Goals:**
- 新增 7 个集成测试文件，覆盖所有关键链路
- 建立共享的集成测试基础设施（`integration-helpers.ts`），提供智能 mock + Agent 生命周期管理
- 提升现有 5 个集成测试的 mock 质量，使测试能验证实际行为而非仅结构
- 保持与 `setup.ts` 全局 mock 的兼容（不影响 unit 测试）

**Non-Goals:**
- 不修改生产代码
- 不新增外部依赖
- 不追求 100% 覆盖率
- 不做性能/压力测试
- 不修改 `sqlite-persistence.test.ts` 和 `tool-system.test.ts`（已高质量）

## Decisions

### D1: 共享基础设施放在 `tests/integration/integration-helpers.ts`

**选择**: 在 integration 目录下创建专用 helper 文件，而非修改全局 `setup.ts`。

**原因**:
- `setup.ts` 被 unit + integration 共用，改动会影响 23 个 unit 测试
- 集成测试需要更丰富的 mock（toolCalls、多轮响应），unit 测试不需要
- 隔离性好：集成测试可以独立演进

**替代方案**: 在各文件内 `vi.mock` 局部覆盖 — 代码重复多，维护成本高。

### D2: 智能 Mock 采用 `vi.mock` 覆盖 + 工厂函数

**选择**: `integration-helpers.ts` 导出工厂函数，各测试文件通过 `vi.mock('ai', ...)` 覆盖全局 mock。

**原因**:
- Vitest 的 `vi.mock` 是 hoisted 的，模块加载前生效，覆盖 `setup.ts` 的全局 mock
- 工厂函数允许每个测试文件自定义 mock 行为
- 不同测试场景需要不同的 mock 响应（纯文本 vs 工具调用 vs 多轮）

**实现模式**:
```typescript
// integration-helpers.ts
export function createMockAI(responses: MockResponse[]) { ... }

// 各测试文件
const { mockGenerateText } = createMockAI([...]);
vi.mock('ai', () => ({ generateText: mockGenerateText, streamText: ... }));
```

### D3: Mock 响应结构对齐 AI SDK 实际返回值

**选择**: mock 响应严格对齐 `@ai-sdk/openai` 的 `generateText` / `streamText` 返回结构。

**原因**: 集成测试的目标是验证 Agent 能正确处理 LLM 返回值。如果 mock 结构与真实不符，测试通过但生产会崩溃。

**关键结构**:
```typescript
// generateText mock
{
  text: string,
  steps: Array<{
    toolCalls: Array<{ toolName: string, args: Record<string, unknown> }>
    toolResults: Array<{ result: unknown }>
  }>,
  finishReason: 'stop' | 'tool-calls',
  totalUsage: { inputTokens: number, outputTokens: number }
}

// streamText mock
fullStream: AsyncGenerator<
  { type: 'text-delta', text: string }
  | { type: 'tool-call', toolName: string, args: Record<string, unknown> }
  | { type: 'tool-result', result: unknown }
  | { type: 'finish', finishReason: string, totalUsage: {...} }
>
```

### D4: Agent 生命周期管理采用回调模式

**选择**: 提供 `withAgent(callback)` 辅助函数，自动 `createAgent() → initialize() → callback → dispose()`。

**原因**:
- 所有集成测试都需要 Agent 实例
- `initialize()` 和 `dispose()` 是 async 的，容易遗漏
- 回调模式保证资源清理（即使测试抛异常）

### D5: 现有测试增强策略 — 逐步替换而非重写

**选择**: 在现有测试文件中引入 `integration-helpers.ts`，逐步增加行为验证测试用例，不删除现有结构验证用例。

**原因**:
- 现有测试有价值的结构验证（导出存在性、方法签名等）
- 增量式修改降低风险
- 保留 git blame 历史

## Risks / Trade-offs

**[Risk] mock 结构与真实 AI SDK 返回值不一致** → Mitigation: 从 AI SDK 源码和实际 E2E 测试日志中提取真实返回结构，作为 mock 模板。在 `integration-helpers.ts` 中添加 JSDoc 注释说明结构来源。

**[Risk] vi.mock hoisting 导致变量引用错误** → Mitigation: 使用 `vi.hoisted()` 定义 mock 变量，确保在 hoisted 的 `vi.mock` 回调中可引用。

**[Risk] 集成测试运行时间增长** → Mitigation: 保持 `fileParallelism: true`（默认），使用内存 SQLite 而非文件，清理临时文件。

**[Trade-off] 不用真实 LLM 做集成测试** → 接受。E2E 测试已覆盖真实 LLM 场景，集成测试聚焦模块协作正确性。使用智能 mock 可以稳定重现各种 LLM 行为（工具调用、多轮对话、错误等），真实 LLM 不可控。
