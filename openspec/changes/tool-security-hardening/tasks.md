## 1. 安全基础设施

- [x] 1.1 在 `security.ts` 中新增 `isPathAllowed(filePath: string, allowedRoots: string[]): boolean` — 使用 `path.resolve()` 解析后检查是否在允许的根目录列表内。支持 `HIVE_WORKING_DIR` 环境变量
- [x] 1.2 在 `security.ts` 中新增 `isPrivateIP(hostname: string): Promise<boolean>` — DNS 解析后检查 IP 是否在私有段（127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1, fc00::/7）
- [x] 1.3 在 `security.ts` 中新增 `isCommandAllowed(command: string, allowlist: string[]): boolean` — 检查命令前缀是否在 allowlist 中，allowlist 默认值包含 git, npm, pnpm, node, cat, ls, find, grep, head, tail, wc, echo, mkdir, cp, mv, diff, env, which, pwd, cd, test
- [x] 1.4 新增 `HIVE_WORKING_DIR` 和 `HIVE_BASH_ALLOWLIST` 环境变量支持，在 `security.ts` 中读取

## 2. grep-tool 重写

- [x] 2.1 重写 `grep-tool.ts` — 移除 `child_process.exec` 依赖，改用 `fs.readdir` 递归遍历 + `RegExp` 正则匹配实现。参数不变：pattern, path, glob, maxResults, caseInsensitive。返回格式保持一致
- [x] 2.2 为 grep-tool 新增路径约束 — 调用 `isPathAllowed(dir)` 验证搜索路径
- [x] 2.3 为 grep-tool `maxResults` schema 添加 `.max(1000)` 上限约束

## 3. web-fetch SSRF 防护

- [x] 3.1 在 `web-fetch-tool.ts` 中新增 URL scheme 校验 — Zod schema 使用 `.url()` 并自定义 refine 拒绝非 https:// scheme（`file://`, `ftp://` 等）
- [x] 3.2 在 `web-fetch-tool.ts` 中新增内网 IP 拒绝 — fetch 前调用 `isPrivateIP()` 检查 hostname
- [x] 3.3 为 `maxChars` schema 添加 `.max(100000)` 上限约束

## 4. file-tool 安全加固

- [x] 4.1 在 `file-tool.ts` 中新增路径约束 — view/create/str_replace/insert 均调用 `isPathAllowed(filePath)` 验证
- [x] 4.2 消除 TOCTOU 竞态 — 移除 `existsSync()` 调用，改为直接 try/catch `readFile`/`writeFile` 的 ENOENT 错误
- [x] 4.3 使用 Zod discriminated union 重构 input schema — 按命令类型分离必填字段（view 不需要 content，create 需要 content），消除 `!` 非空断言

## 5. glob-tool 安全加固

- [x] 5.1 在 `glob-tool.ts` 中新增路径约束 — 调用 `isPathAllowed(dir)` 验证搜索路径
- [x] 5.2 在 `glob-tool.ts` 的 `simpleGlob()` 中添加深度限制（最大 20 层）和最大条目数限制（10000）
- [x] 5.3 为 `maxResults` schema 添加 `.max(1000)` 上限约束
- [x] 5.4 消除 `let files` 变体重赋值，改用 `const`

## 6. bash-tool 安全加固

- [x] 6.1 在 `bash-tool.ts` 中新增 allowlist 检查 — 在危险命令黑名单检查之前，先检查命令前缀是否在 allowlist 中（可通过 `HIVE_BASH_ALLOWLIST` 配置）
- [x] 6.2 为 `timeout` schema 添加 `.min(1000).max(600000)` 约束
- [x] 6.3 增强 `security.ts` 中的危险命令黑名单 — 覆盖 `rm -r -f /`（拆分 flag）、`curl -s url -o /tmp/x && bash /tmp/x` 等绕过变体

## 7. web-search 结果限制

- [x] 7.1 在 `web-search-tool.ts` 中添加结果数量限制（默认最多 10 条）
- [x] 7.2 对 web-search 返回结果应用 `truncateOutput()`

## 8. 资源泄漏修复

- [x] 8.1 修复 `runner.ts` 中 `executeWithConfig` 的 timeout timer 泄漏 — 存储 `setTimeout` 返回值，在 `Promise.race` 的 `finally` 块中 `clearTimeout`
- [x] 8.2 修复 `ChatCapability.ts` 中 `combineAbortSignals` 的监听器泄漏 — 改用 `AbortSignal.any()`（Node 20+），移除手动 `addEventListener('abort', ...)`

## 9. 测试

- [x] 9.1 为 `isPathAllowed` 编写单元测试 — 正常路径、`../` 穿越、符号链接、环境变量配置
- [x] 9.2 为 `isPrivateIP` 编写单元测试 — 各私有 IP 段、公共 IP、localhost
- [x] 9.3 为 `isCommandAllowed` 编写单元测试 — allowlist 内命令、allowlist 外命令、黑名单命令
- [x] 9.4 为 grep-tool 重写后的安全测试 — 特殊字符注入、glob 注入、路径穿越
- [x] 9.5 为 web-fetch SSRF 防护编写测试 — file:// scheme、内网 IP、正常 https URL
- [x] 9.6 为 file-tool 路径约束编写测试 — 路径穿越拒绝、工作目录内允许、TOCTOU 修复验证
- [x] 9.7 为 bash-tool allowlist 编写测试 — 允许命令、拒绝命令、绕过尝试
- [x] 9.8 更新现有工具测试适配 schema 变更（timeout/maxResults 范围约束）
- [x] 9.9 运行 `pnpm --filter @hive/core test` 确保全部测试通过
