## Why

简单问候消息（如 "你好啊"）被路由到完整的 explore → plan → execute 三子代理工作流，导致 3-10 次不必要的 LLM 调用。Dispatcher 分类器的 LLM Prompt 存在 safe default 偏向 workflow 的缺陷，且 WorkflowCapability 内部的 simple 判断过于单一（仅检查 `?` 结尾），双重失效导致简单任务空耗 token 和延迟。GitHub Issue: #36。

## What Changes

- **改进 Dispatcher LLM 分类 Prompt**：翻转 safe default 方向（uncertain → chat），添加中英双语 few-shot 示例，明确 chat 与 workflow 的判定边界
- **增强 WorkflowCapability.analyzeTask()**：扩展 simple 任务识别逻辑，对短消息、无操作动词的消息短路，避免不必要的 explore/plan 阶段
- **更新相关单元测试**：覆盖问候语、闲聊、短消息等场景的分类和路由测试

## Capabilities

### New Capabilities

（无新能力）

### Modified Capabilities

- `unified-execution-engine`: Dispatcher 分类器的 Prompt 策略和 fallback 逻辑变更，analyzeTask 的 simple 判断逻辑扩展

## Impact

- `packages/core/src/agents/dispatch/classifier.ts` — DISPATCH_SYSTEM_PROMPT 改写
- `packages/core/src/agents/capabilities/WorkflowCapability.ts` — analyzeTask() 方法
- `packages/core/tests/unit/dispatch/` — 分类器测试用例扩展
- `packages/core/tests/unit/capabilities/` — WorkflowCapability 测试用例扩展
- **无 API 变更，无破坏性变更**
