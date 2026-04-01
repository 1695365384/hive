## Why

当前 6 个内置工具（send-file、web-search、web-fetch、glob、grep、ask-user）直接使用 AI SDK `tool()` 返回 string，没有经过 harness 层。这意味着它们缺少统一的错误码分类、hint 注入和瞬态错误自动重试。实际表现：send-file 调飞书 API 返回 400 时直接失败，LLM 不会重试，用户收到"文件发送遇到问题"。

## What Changes

- 将 6 个未接入 harness 的内置工具改造为 `createRaw*Tool()` + `withHarness()` 模式
- 每个工具的 execute 返回 `ToolResult`（结构化错误码），由 harness 统一序列化为 string
- 网络类工具（send-file、web-search、web-fetch）的瞬态错误自动重试
- 新增 send-file、web-search、web-fetch 的 hint 模板
- 导出 `createRaw*Tool()` 供单元测试直接验证 ToolResult

## Non-goals

- 不修改已接入 harness 的 bash-tool 和 file-tool
- 不修改 harness 核心逻辑（retry、serializer、withHarness）
- 不改变工具的对外 API（createXxxTool 签名不变）
- 不引入新的依赖

## Capabilities

### New Capabilities

（无新 capability）

### Modified Capabilities

- `builtin-tools`: 新增 6 个工具的 ToolResult 返回、错误码映射和 hint 模板
- `tool-registry`: 工具注册方式从直接工厂改为 harness 包装后的工厂
- `send-file-tool`: 接入 harness，网络错误自动重试

## Impact

- **packages/core**: `tools/built-in/` 下 6 个工具文件改造，`tools/built-in/index.ts` 导出更新
- **packages/core**: `tools/harness/hint-registry.ts` 新增 hint 模板
- **packages/core**: 单元测试需要适配 ToolResult 返回格式
- **无破坏性变更**: 对外 API（createXxxTool、导出类型）保持不变
