## Context

Hive 的内置工具（file-tool, bash-tool）通过 AI SDK 的 `tool()` 函数注册，`execute` 返回纯字符串。当工具执行失败时，返回的字符串如 `[Error] 未找到要替换的文本` 缺乏结构化信息，LLM 无法区分错误类型、无法获得恢复建议，经常误判为成功或直接放弃。

当前调用链：
```
LLM → AI SDK tool.execute() → string → 返回给 LLM
```

需要改造为：
```
LLM → AI SDK tool.execute() → withHarness(rawTool.execute() → ToolResult) → string → 返回给 LLM
```

关键约束：AI SDK 的 `tool()` 要求 `execute` 返回 `string`，不能修改。所以 ToolResult 仅存在于工具内部，withHarness 负责序列化。

## Goals / Non-Goals

**Goals:**
- 所有工具失败返回结构化 ToolResult，携带错误码和上下文
- 瞬态错误（TIMEOUT, NETWORK, RATE_LIMITED）由 harness 静默重试，不消耗 LLM step
- 非瞬态错误通过 hint 注入帮助 LLM 自愈
- 工具对外接口不变（AI SDK `tool()` 的 execute 仍返回 string）

**Non-Goals:**
- 不改造所有内置工具，仅覆盖 file-tool 和 bash-tool
- 不实现事后验证循环（post-hoc validation）
- 不修改 LLMRuntime 或 AI SDK 调用层
- 不修改 hook 系统

## Decisions

### D1: ToolResult 接口设计

```typescript
interface ToolResult {
  ok: boolean;
  code: string;
  data?: string;
  error?: string;
  context?: Record<string, unknown>;
}
```

`code` 是错误码（如 `MATCH_FAILED`），`context` 是上下文变量（如 `{ path, command }`），供 hint 模板填充。

**替代方案**: 在 ToolResult 中加入 `hint` 字段让工具直接提供完整 hint。否决——hint 应由 harness 模板生成，工具只需提供 context。

### D2: 错误码三分类

| 类别 | 错误码 | Harness 行为 |
|------|--------|-------------|
| TRANSIENT | TIMEOUT, NETWORK, RATE_LIMITED | 静默重试 max 2 次，指数退避 |
| RECOVERABLE | MATCH_FAILED, NOT_FOUND, PERMISSION, PATH_BLOCKED, INVALID_PARAM, EXEC_ERROR, IO_ERROR | 注入 hint，LLM 自愈 |
| BLOCKED | DANGEROUS_CMD, COMMAND_BLOCKED, SENSITIVE_FILE, UNKNOWN_COMMAND | 注入 hint，建议"告知用户" |

**替代方案**: 所有错误都重试。否决——安全策略错误重试无意义，浪费资源。

### D3: withHarness 包装策略（A+B 混合）

- **A 层（统一）**: `withHarness()` 高阶函数负责 retry、hint fallback、serialize
- **B 层（工具级）**: 各工具工厂函数定义自己的 hint 模板，提供 context

包装发生在 `tool-registry.ts` 的 `getToolsForAgent()` 中：
1. 工厂函数（createFileTool, createBashTool）返回 rawTool（execute → ToolResult）
2. `withHarness(rawTool, hintTemplates)` 包装为 AI SDK 兼容的 tool（execute → string）

**替代方案**: 在每个工厂函数内部完成所有逻辑。否决——retry/serialize 逻辑重复，违反 DRY。

### D4: 序列化格式

```
成功:  [OK] 文件已创建: /path/to/file.ts
失败:  [Error] 未找到要替换的文本。
       [Hint] 建议: 先用 file view 读取 /path/to/file.ts 确认当前内容...
安全:  [Security] 阻止写入敏感文件: SSH 密钥目录
       路径: /home/user/.ssh/id_rsa
       [Hint] 建议: 拒绝访问敏感文件（SSH 密钥目录）。请告知用户手动操作。
```

保持与现有 `[OK]`/`[Error]`/`[Security]` 前缀的兼容，新增 `[Hint]` 前缀。

### D5: Hint 模板注册表

每个工具声明自己的 hint 模板，通过 `withHarness` 注入。模板是 `(context: Record<string, unknown>) => string` 函数，接收 ToolResult 的 context 字段填充变量。

工具不需要提供完整 hint——只需提供 context（如 `{ path: filePath }`），harness 用模板生成 hint。工具也可以覆盖模板，直接在 ToolResult 中提供自定义 hint。

### D6: 异常兜底

withHarness 最外层 try-catch 确保工具崩溃时仍返回 string，不会导致 AI SDK step 崩溃。

## Risks / Trade-offs

- **[Risk] 序列化后的 hint 可能太长，浪费 context window** → Mitigation: hint 模板控制在 1-2 句话内，不重复 error 信息
- **[Risk] 静默重试可能掩盖真实的系统问题** → Mitigation: 仅 TRANSIENT 类错误重试，max 2 次，可通过日志观测
- **[Risk] hint 模板是静态的，可能不适用所有场景** → Mitigation: 工具可通过 context 提供动态信息，模板本身可按需扩展
- **[Trade-off] rawTool 和 wrappedTool 是两个不同对象** → 工具注册时需要确保用 wrappedTool，不会误用 rawTool
