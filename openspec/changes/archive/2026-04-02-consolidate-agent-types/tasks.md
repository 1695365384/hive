## 1. agents.ts — 精简 Agent 定义

- [x] 1.1 CORE_AGENTS 改为 `explore` + `general` 两种，删除 evaluator 独立定义
- [x] 1.2 AGENT_NAMES 保留 EVALUATOR/PLAN 字段但标记 `@deprecated`
- [x] 1.3 `getAgentConfig()` 增加 plan→explore、evaluator→general 的别名映射
- [x] 1.4 `getAllAgentNames()` 返回 `['explore', 'general']`

## 2. tool-registry.ts — 精简工具白名单

- [x] 2.1 AGENT_TOOL_WHITELIST 删除 plan 和 evaluator 条目
- [x] 2.2 `getToolsForAgent('plan')` fallback 到 explore 白名单
- [x] 2.3 `getToolsForAgent('evaluator')` fallback 到 general 白名单

## 3. LLMRuntime.ts — 精简预设

- [x] 3.1 AGENT_PRESETS 删除 plan 和 evaluator
- [x] 3.2 确认 runtime.run() 中 preset fallback 逻辑正确

## 4. Prompt 模板合并

- [x] 4.1 合并 plan.md 的结构化输出到 explore.md，删除 plan.md
- [x] 4.2 PromptTemplate 注册表删除 plan 模板
- [x] 4.3 `buildPlanPrompt()` 标记 @deprecated，内部委托 `buildExplorePrompt(task, 'very-thorough')`

## 5. ExecutionCapability.ts — forceMode 别名

- [x] 5.1 `buildSystemPrompt()` 中 forceMode 'plan' 映射到 explore 模板
- [x] 5.2 `selectTools()` 中 forceMode 'plan' 使用 explore 工具集

## 6. runner.ts — 清理便捷方法

- [x] 6.1 `plan()` 标记 @deprecated
- [x] 6.2 `evaluator()` 标记 @deprecated
- [x] 6.3 `planTask()` 标记 @deprecated
- [x] 6.4 `evaluatorTask()` 标记 @deprecated

## 7. 测试修复

- [x] 7.1 修复 builtin.test.ts 中依赖 evaluator/general agent 类型的断言
- [x] 7.2 修复 runner.test.ts 中依赖 evaluator/plan 方法的测试
- [x] 7.3 修复 index.test.ts 中依赖 core agents 数量的断言
- [x] 7.4 集成测试失败为预已存在问题（result.text 为空），与本次改动无关

## 8. 验证

- [x] 8.1 `pnpm --filter @bundy-lmw/hive-core build` 通过
- [x] 8.2 `pnpm test` 单元测试 101/101 通过（集成测试 4 个预已存在失败与本次无关）
