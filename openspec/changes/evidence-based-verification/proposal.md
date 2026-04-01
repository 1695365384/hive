## Why

当前 anti-hallucination 验证系统使用硬编码规则（`task.length > 5`）和 LLM 自省（让同一个 LLM 判断自己是否完成任务）来验证任务完成度。这导致信息查询任务（如"读取备忘录"）被误判为未完成——Agent 已成功获取数据，但验证步骤让 LLM 重新执行或覆盖正确结果。根本矛盾是"用幻觉检测幻觉"，无论怎么调 prompt 都无法从根本上解决。

## What Changes

- **BREAKING** 删除 Defense 3（Steps 自省）：移除 `buildIntrospectionMessages()`、`formatStepsSummary()` 及相关逻辑，不再让 LLM 自我验证
- **BREAKING** 删除 `needsVerification()` 硬编码阈值：移除 `task.length > 5` 判断
- 新增 **Evidence-Based 完成度检查**：基于工具调用结果的确定性信号（工具是否成功、是否返回数据、是否有写操作）判断任务完成度，零额外 LLM 调用
- 新增 **任务类型推断**：从已执行的工具调用结果反推任务类型（information / action / unknown），不依赖硬编码规则或额外 LLM 调用
- 重构 Defense 2（零工具调用拦截）：改为基于任务类型的差异化处理——信息查询零工具可能是纯知识问答（正常），操作任务零工具才可疑

## Capabilities

### New Capabilities
- `task-verification`: 基于工具调用证据的任务完成度验证系统，替代 LLM 自省模式

### Modified Capabilities
（无现有 spec 需要修改，这是 ExecutionCapability 内部实现变更）

## Impact

- **Core (`packages/core`)**: `ExecutionCapability.ts` 是主要变更文件，`LLMRuntime.ts` 的 `StepResult` 类型可能需要扩展以携带更多工具结果元数据
- **测试**: 需要新增单元测试覆盖各种任务类型 + 工具结果组合的验证场景
- **无 API 变更**: 这是内部执行流程变更，对外接口（`dispatch()`、`DispatchResult`）保持不变
- **Non-goals**: 不涉及 Server 层、Channel 层、Desktop 层的变更；不涉及新的 LLM 调用；不做 grounding 检查（留作后续优化）
