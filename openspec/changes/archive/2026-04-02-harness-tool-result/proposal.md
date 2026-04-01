## Why

Hive 的 Agent 工具返回纯字符串，缺乏结构化错误信息。当工具失败时（如权限不足、文件不存在、文本未匹配），Agent 无法有效自愈——它要么误判为成功，要么直接放弃。Harness Engineering 的核心思想是在 LLM 和工具之间建立控制面，通过结构化返回值 + 智能提示注入 + 静默重试，让 Agent 在遇到错误时能自主恢复，只有穷尽所有手段后才向用户报告失败。

## What Changes

- 新增 `ToolResult` 结构化返回类型，替代工具内部的纯字符串返回
- 新增 `withHarness` 包装层，在工具 execute 和 AI SDK 之间提供 retry + hint injection + serialize
- 新增错误码分类体系（TRANSIENT / RECOVERABLE / BLOCKED）和 hint 模板注册表
- 改造 `file-tool` 的所有返回点为 ToolResult
- 改造 `bash-tool` 的所有返回点为 ToolResult
- 修改 `tool-registry` 在工具注册时自动应用 withHarness 包装

## Capabilities

### New Capabilities
- `harness-layer`: 工具 harness 层（ToolResult 类型、withHarness 包装器、hint 注册表、retry 逻辑、序列化器）

### Modified Capabilities

## Impact

- **core 包**: `tools/built-in/file-tool.ts`、`tools/built-in/bash-tool.ts`、`tools/tool-registry.ts`
- **新增文件**: `tools/harness/` 目录（types.ts, hint-registry.ts, serializer.ts, retry.ts, with-harness.ts）
- **不改动**: LLMRuntime.ts（AI SDK 调用点不变）、hook 系统（tool:before/after 不变）
- **不改动**: 其他内置工具（glob-tool, grep-tool, web-search-tool, web-fetch-tool, ask-user-tool, send-file-tool）暂不纳入
- **API 兼容性**: 对外暴露的工具接口不变（AI SDK `tool()` 的 execute 仍然返回 `string`），内部实现改为 ToolResult + withHarness 包装

## Non-goals

- 不实现事后验证循环（post-hoc validation loop）—— 本次聚焦工具执行时的自愈，不涉及结果验证
- 不改造所有内置工具—— 仅覆盖 file-tool 和 bash-tool（最痛的两个）
- 不修改 hook 系统的接口或行为
- 不实现 LLM 级别的重试（如重新生成工具调用参数）—— 仅工具级别的静默重试
