## 1. 删除 Swarm 系统

- [x] 1.1 删除 `packages/core/src/agents/swarm/` 整个目录
- [x] 1.2 删除 `packages/core/src/agents/capabilities/SwarmCapability.ts`
- [x] 1.3 清理 `packages/core/src/agents/core/Agent.ts`：删除 swarm/pipeline 相关 import、字段、方法（swarm/pipeline/previewSwarm/registerSwarmTemplate/swarmCapability）
- [x] 1.4 清理 `packages/core/src/agents/index.ts` 和 `packages/core/src/index.ts` 中的 swarm/pipeline 类型导出

## 2. 删除 Pipeline 系统

- [x] 2.1 删除 `packages/core/src/agents/pipeline/` 整个目录
- [x] 2.2 清理 `packages/core/src/agents/core/Agent.ts` 中的 pipeline() 方法

## 3. 简化 Dispatcher

- [x] 3.1 简化 `dispatch/types.ts`：ExecutionLayer 改为 `'chat' | 'workflow'`，删除 suggestedTemplate/suggestedVariant/suggestedStages
- [x] 3.2 简化 `dispatch/classifier.ts`：分类只返回 chat 或 workflow，正则 fallback 也只区分这两类
- [x] 3.3 简化 `dispatch/Dispatcher.ts`：删除 executeSwarm/executePipeline 分支，只保留 executeChat/executeWorkflow；删除 swarm/pipeline 相关 import
- [x] 3.4 简化 `dispatch/index.ts`：删除不再需要的类型导出

## 4. 增强 WorkflowCapability

- [x] 4.1 WorkflowCapability 获取 SubAgentCapability 引用（通过 context.getCapability）
- [x] 4.2 增强 analyzeTask()：moderate/complex 任务返回 needsExploration=true, needsPlanning=true
- [x] 4.3 增强 run()：moderate/complex 任务执行 explore → plan → execute 三阶段顺序流程
- [x] 4.4 WorkflowResult 中增加 exploreResult 和 planResult 字段记录各阶段产出

## 5. 清理外部引用

- [x] 5.1 清理 `packages/core/src/cli.ts` 中 swarm/pipeline 相关代码（已确认无引用）
- [x] 5.2 清理 `apps/server/` 中 swarm/pipeline 相关 API 端点（已确认无引用）
- [x] 5.3 清理 `packages/core/src/hooks/types/contexts.ts` 中的 swarm 相关 hook 类型（如 swarm:complete）

## 6. 删除测试

- [x] 6.1 删除 `packages/core/tests/unit/swarm/` 整个目录
- [x] 6.2 删除 `packages/core/tests/unit/pipeline/` 整个目录
- [x] 6.3 精简 `packages/core/tests/unit/dispatch/` 中的测试：删除 swarm/pipeline 相关用例
- [x] 6.4 补充 WorkflowCapability 三阶段执行的单元测试

## 7. 验证

- [x] 7.1 TypeScript 编译通过 (`npm run build`)
- [x] 7.2 单元测试全部通过 (`npx vitest run packages/core/tests/unit/`) — 351 passed
- [x] 7.3 集成测试通过 (`npx vitest run packages/core/tests/integration/`) — 192 passed
