## Why

内置工具系统存在多个安全漏洞：grep-tool 的命令注入、web-fetch 的 SSRF、file/glob/grep 的路径穿越、bash-tool 的黑名单绕过，以及 runner 和 ChatCapability 中的资源泄漏。这些问题在 LLM Agent 控制工具执行的场景下尤其危险——LLM 可能被 prompt injection 诱导触发这些漏洞。

## What Changes

- **grep-tool**: 将 `exec()` 字符串拼接替换为 Node.js 原生文件读取 + 正则匹配，消除 shell 注入面
- **web-fetch**: 添加 URL scheme 白名单（仅 https）和内网 IP 段拒绝
- **file-tool / glob-tool**: 添加工作目录边界检查，`path.resolve()` 后验证路径在工作目录内
- **bash-tool**: 将危险命令黑名单升级为 allowlist + 沙箱提示
- **bash-tool / web-fetch / glob-tool / grep-tool**: 添加输入参数边界验证（timeout、maxResults、maxChars 上限）
- **runner.ts**: 修复 `Promise.race` timeout timer 泄漏
- **ChatCapability.ts**: 修复 `combineAbortSignals` 事件监听器泄漏
- **file-tool**: 消除 TOCTOU 竞态，移除 `existsSync()` 改用 try/catch
- **file-tool**: 使用 discriminated union schema 消除 `!` 非空断言
- **web-search-tool**: 添加 `maxResults` 限制和 `truncateOutput`

## Capabilities

### New Capabilities

- `tool-input-validation`: 工具输入参数的边界验证（Zod schema 约束：timeout 上下限、maxResults 上限、maxChars 上限）
- `path-containment`: 文件系统操作的工作目录边界约束，防止路径穿越

### Modified Capabilities

- `unified-execution-engine`: grep-tool 从 shell exec 改为原生 JS 实现；bash-tool 安全模型从黑名单改为 allowlist；新增 SSRF 防护
- `builtin-tools`: file-tool 消除 TOCTOU 竞态和非空断言；glob-tool 添加深度限制；web-search 添加截断

## Impact

- **安全面**: 消除 5 个 CRITICAL/HIGH 安全漏洞
- **代码**: `grep-tool.ts` 大幅重写（移除 `exec` 依赖）；`security.ts` 扩展；所有工具 schema 更新
- **资源**: 修复 2 个内存/资源泄漏（runner timeout、ChatCapability 监听器）
- **测试**: 新增安全边界测试（命令注入、SSRF、路径穿越、allowlist 绕过）
- **API**: 工具 schema 添加 min/max 约束，对外部调用者透明（已有参数不变，仅收窄范围）
