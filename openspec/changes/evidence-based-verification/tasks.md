## 1. 调研与准备

- [ ] 1.1 检查 `LLMRuntime.ts` 中 `StepResult` 和 `RuntimeResult` 的类型定义，确认工具调用结果中包含成功/失败信号
- [ ] 1.2 检查 `runtimeResult.tools` 数组的内容格式（工具名列表 vs 工具调用详情），确认可用于推断任务类型

## 2. 实现任务类型推断

- [ ] 2.1 在 `ExecutionCapability.ts` 中实现 `inferTaskType()` 方法：从工具调用记录推断 `information` / `action` / `unknown`
- [ ] 2.2 定义 `TaskType` 和 `CompletionEvidence` 类型

## 3. 实现证据完成度检查

- [ ] 3.1 实现 `checkCompletion()` 方法：根据任务类型 + 工具结果判定完成度
- [ ] 3.2 实现 `emitVerificationResult()` 方法：将验证结果写入日志和 hook 事件，不覆盖原始输出

## 4. 重构验证流程

- [ ] 4.1 删除 Defense 3（Steps 自省）：移除 `buildIntrospectionMessages()`、`formatStepsSummary()` 方法及 `run()` 中对应的调用代码块（约 214-282 行区域）
- [ ] 4.2 删除 `needsVerification()` 方法
- [ ] 4.3 用新的 evidence-based 验证替换原验证区域：调用 `inferTaskType()` → `checkCompletion()` → `emitVerificationResult()`
- [ ] 4.4 重构 Defense 2（零工具调用拦截）：仅在非 explore/plan 模式 + unknown 类型时触发

## 5. 测试

- [ ] 5.1 为 `inferTaskType()` 编写单元测试：覆盖 information / action / unknown / 混合读写场景
- [ ] 5.2 为 `checkCompletion()` 编写单元测试：覆盖各种工具结果组合
- [ ] 5.3 为重构后的 `run()` 验证流程编写集成测试：验证不覆盖原始输出、不产生额外 LLM 调用
- [ ] 5.4 运行全量测试确认无回归

## 6. 构建与验证

- [ ] 6.1 `pnpm --filter @bundy-lmw/hive-core build` 确认编译通过
- [ ] 6.2 `pnpm test` 确认所有测试通过
