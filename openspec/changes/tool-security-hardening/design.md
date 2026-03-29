## Context

统一工具系统（unified-tool-system）已实现 7 个内置工具（bash、file、glob、grep、web-search、web-fetch、ask-user），使用 AI SDK v6 `tool()` + Zod schema。Code review 发现 1 个 CRITICAL、6 个 HIGH、9 个 MEDIUM 安全和代码质量问题。

当前安全模型依赖黑名单（`isDangerousCommand`）和 `isSensitiveFile` 正则匹配，两者都可绕过。文件操作无工作目录边界，web-fetch 无 URL 校验，grep-tool 直接拼接 shell 命令。

## Goals / Non-Goals

**Goals:**
- 消除所有 CRITICAL 和 HIGH 安全漏洞
- 修复资源泄漏（runner timeout、ChatCapability 监听器）
- 强化输入参数边界验证

**Non-Goals:**
- 不实现完整的操作系统级沙箱（如容器/namespace）
- 不改变工具对外 API 接口（保持向后兼容）
- 不重构 ToolRegistry 架构
- 不修改 LLMRuntime 的 `as any` 类型问题（属于类型安全，非安全漏洞）

## Decisions

### D1: grep-tool 改用原生 JS 实现（替代 exec）

**决策**: 移除 `child_process.exec`，改用 `fs.readdir` + 正则匹配实现文件内容搜索。

**理由**: `exec()` 的 shell 字符串拼接是命令注入的根源。`execFile()` 虽然更安全但仍依赖外部 `grep` 二进制。原生实现跨平台、零依赖、无注入面。

**trade-off**: 性能低于系统 `grep`，但对于 Agent 场景（搜索量小）完全可接受。

### D2: web-fetch URL 校验 + 内网 IP 拒绝

**决策**: 仅允许 `https://` scheme（开发环境可配 `http://` 白名单域名），拒绝解析到私有 IP 段的请求。

**理由**: SSRF 是 web-fetch 最大的安全风险。LLM 可能被 prompt injection 诱导访问云元数据端点或内网服务。

**实现**:
```
1. Zod schema 校验 URL scheme
2. DNS 解析后检查 IP 是否在私有段：
   127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1, fc00::/7
3. 拒绝 file://、ftp:// 等非 HTTP scheme
```

### D3: 工作目录边界约束

**决策**: file-tool、glob-tool、grep-tool 的路径参数通过 `path.resolve()` 解析后，验证是否在允许的根目录内。默认根目录为 `process.cwd()`，可通过环境变量 `HIVE_WORKING_DIR` 覆盖。

**理由**: 防止 Agent 读写工作目录之外的文件（如 `/etc`、其他用户的 home 目录）。

**实现**: 新增 `security.ts` 中的 `isPathAllowed(filePath, allowedRoot)` 函数。

### D4: bash-tool 从黑名单改为 allowlist

**决策**: 保留危险命令黑名单作为第一道防线，但增加 allowlist 模式——默认只允许 `git`、`npm`、`pnpm`、`node`、`cat`、`ls`、`find`、`grep`、`head`、`tail`、`wc`、`echo`、`mkdir`、`cp`、`mv`、`diff`、`env` 等安全命令前缀。通过 `--unsafe` flag 或环境变量可切换为全开放模式。

**理由**: 黑名单天然不完备，allowlist 更安全。保留黑名单作为双保险。

**trade-off**: 可能阻止某些合法但不在白名单的命令。通过可配置白名单缓解。

### D5: 输入参数 Zod schema 边界约束

**决策**: 所有数值参数添加 min/max 约束：
- `timeout`: `[1000, 600000]`（1s ~ 10min）
- `maxResults`: `[1, 1000]`
- `maxChars`: `[100, 100000]`
- glob 深度限制: 最大 20 层

### D6: 修复资源泄漏

**决策**:
- `runner.ts`: 存储 `setTimeout` ID，在 `Promise.race` 的 `finally` 中 `clearTimeout`
- `ChatCapability.ts`: 改用 `AbortSignal.any()`（Node 20+），消除手动事件监听

### D7: file-tool 消除 TOCTOU 和非空断言

**决策**:
- 移除 `existsSync()` 调用，改用 try/catch 处理 `ENOENT`
- 使用 Zod discriminated union 按命令类型分离必填字段，消除 `!` 断言

## Risks / Trade-offs

| 风险 | 影响 | 缓解 |
|------|------|------|
| allowlist 过于严格，阻止合法命令 | Agent 功能受限 | 可配置白名单 + `--unsafe` 模式 |
| DNS 解析增加 web-fetch 延迟 | 每次请求多一次 DNS 查询 | 仅对首次请求校验，可缓存结果 |
| grep 原生实现性能低于系统 grep | 大文件搜索较慢 | Agent 场景搜索量小，可接受 |
| 工作目录约束过于严格 | 无法搜索 node_modules 等 | 允许配置多个根目录 |
