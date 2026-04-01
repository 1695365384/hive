## Context

Hive 的工具系统已有 harness 层（`tools/harness/`），提供了 ToolResult 结构化返回、错误码分类（TRANSIENT/RECOVERABLE/BLOCKED）、瞬态错误自动重试和 hint 注入。目前 bash-tool 和 file-tool 已接入，但其余 6 个工具仍直接使用 AI SDK `tool()` 返回 string。

现有模式（bash/file 为例）：
```
createRawXxxTool() → RawTool (execute → ToolResult)
createXxxTool()     → withHarness(createRawXxxTool()) → AI SDK Tool (execute → string)
```

## Goals / Non-Goals

**Goals:**
- 6 个工具全部接入 harness，统一错误处理和重试机制
- 网络类工具（send-file、web-search、web-fetch）瞬态错误自动重试
- 本地类工具（glob、grep）结构化错误码 + hint 注入
- ask-user 接入 harness，统一错误格式
- 导出 `createRaw*Tool()` 供单元测试验证 ToolResult

**Non-Goals:**
- 不修改 harness 核心逻辑
- 不改变工具对外 API 签名
- 不修改 bash-tool 和 file-tool

## Decisions

### D1: 改造模式统一为 RawTool + withHarness

每个工具拆分为：
- `createRawXxxTool()` — 内部函数，execute 返回 `ToolResult`
- `createXxxTool()` — 公开函数，用 `withHarness()` 包装

与现有 bash-tool 和 file-tool 保持一致。

### D2: 错误码映射

| 工具 | 场景 | 错误码 | 分类 |
|------|------|--------|------|
| send-file | 飞书 API 失败 (400/429/5xx) | NETWORK | TRANSIENT (重试) |
| send-file | 文件不存在 | NOT_FOUND | RECOVERABLE |
| send-file | 无回调注册 | PERMISSION | RECOVERABLE |
| send-file | channel 不支持 | PERMISSION | RECOVERABLE |
| web-search | HTTP 失败 | NETWORK | TRANSIENT (重试) |
| web-search | 无结果 | OK | — |
| web-fetch | HTTP 失败 | NETWORK | TRANSIENT (重试) |
| web-fetch | SSRF/内网 | PATH_BLOCKED | BLOCKED |
| web-fetch | URL scheme 错误 | INVALID_PARAM | RECOVERABLE |
| web-fetch | 内容为空 | NOT_FOUND | RECOVERABLE |
| glob | 路径越界 | PATH_BLOCKED | BLOCKED |
| glob | 无结果 | OK | — |
| grep | 路径越界 | PATH_BLOCKED | BLOCKED |
| grep | 正则错误 | INVALID_PARAM | RECOVERABLE |
| grep | 无匹配 | OK | — |
| ask-user | 无回调注册 | PERMISSION | RECOVERABLE |
| ask-user | 回调异常 | EXEC_ERROR | RECOVERABLE |

### D3: 网络工具重试配置

send-file、web-search、web-fetch 通过 harness 的 `maxRetries: 2, baseDelay: 500` 配置获得自动重试。本地工具（glob、grep、ask-user）使用默认配置（不重试 TRANSIENT，只做 hint 注入）。

### D4: 新增 hint 模板

在 `hint-registry.ts` 中新增 `SEND_FILE_HINTS`、`WEB_SEARCH_HINTS`、`WEB_FETCH_HINTS`，覆盖网络失败、权限缺失等场景。

### D5: 导出更新

`built-in/index.ts` 新增导出 `createRawSendFileTool`、`createRawWebSearchTool`、`createRawWebFetchTool`、`createRawGlobTool`、`createRawGrepTool`、`createRawAskUserTool`。

## Risks / Trade-offs

- **[序列化格式变化]** harness serializer 输出 `[OK]`/`[Error]`/`[Security]`/`[Hint]` 前缀，与工具当前手写的格式可能略有差异。→ LLM 对这些前缀已有认知（bash/file 已在用），影响极小。
- **[测试适配]** 现有工具测试断言的是 string 格式，需适配新的序列化输出。→ 改动量小，主要是前缀格式统一。
- **[ask-user 重试]** ask-user 是用户交互工具，不应重试。→ 通过不返回 TRANSIENT 错误码实现（回调异常返回 EXEC_ERROR，属于 RECOVERABLE）。
