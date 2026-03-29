## 1. 依赖安装与目录结构

- [x] 1.1 安装新依赖：`pnpm --filter @hive/core add cheerio turndown` 及其类型定义 `@types/turndown`
- [x] 1.2 创建目录结构：`packages/core/src/tools/built-in/`、`packages/core/src/tools/built-in/utils/`

## 2. 通用工具基础设施

- [x] 2.1 实现 `packages/core/src/tools/built-in/utils/output-safety.ts` — 统一的输出截断函数 `truncateOutput(text: string, maxChars?: number): string`，默认 30000 字符，超出时返回截断内容 + "[输出已截断，共 N 字符]"
- [x] 2.2 实现 `packages/core/src/tools/built-in/utils/security.ts` — 从现有 `SecurityHooks` 提取危险命令模式匹配逻辑为独立函数 `isDangerousCommand(command: string): boolean` 和 `isSensitiveFile(filePath: string): boolean`，供 bash-tool 和 file-tool 复用

## 3. Bash 工具

- [x] 3.1 实现 `packages/core/src/tools/built-in/bash-tool.ts` — 使用 `tool()` + Zod schema 定义，参数：command(string)、timeout(number, 默认 120000)。execute 内部使用 `child_process.exec` 执行命令，支持超时中止、输出截断、危险命令检查。导出 `bashTool` 常量

## 4. File 工具

- [x] 4.1 实现 `packages/core/src/tools/built-in/file-tool.ts` — 使用 `tool()` + Zod schema 定义，参数：command(enum: view/create/str_replace/insert)、file_path(string)、content(string, create 时)、old_str/new_str(string, str_replace 时)、insert_text/insert_line(string, insert 时)。execute 内部根据 command 分发到对应文件操作函数，view 支持 offset/limit，所有操作检查敏感文件。导出 `fileTool` 常量

## 5. Search 工具（Glob + Grep）

- [x] 5.1 实现 `packages/core/src/tools/built-in/glob-tool.ts` — 使用 `tool()` + Zod schema 定义，参数：pattern(string)、path(string, 可选)、maxResults(number, 默认 100)。execute 内部使用 `fast-glob`（或 Node.js glob）搜索文件，按修改时间排序，结果截断。导出 `globTool` 常量
- [x] 5.2 实现 `packages/core/src/tools/built-in/grep-tool.ts` — 使用 `tool()` + Zod schema 定义，参数：pattern(string)、path(string, 可选)、glob(string, 可选, 文件类型过滤)、maxResults(number, 默认 50)、caseInsensitive(boolean, 默认 false)。execute 内部使用 `child_process.exec('grep ...')` 或 Node.js 读取 + 正则匹配。导出 `grepTool` 常量

## 6. Web 工具（Search + Fetch）

- [x] 6.1 实现 `packages/core/src/tools/built-in/web-search-tool.ts` — 使用 `tool()` + Zod schema 定义，参数：query(string)。execute 内部 fetch `https://lite.duckduckgo.com/lite/?q=...`，用 cheerio 解析 HTML 提取搜索结果（title、url、snippet）。失败时返回空数组 + 错误提示。导出 `webSearchTool` 常量
- [x] 6.2 实现 `packages/core/src/tools/built-in/web-fetch-tool.ts` — 使用 `tool()` + Zod schema 定义，参数：url(string)、maxChars(number, 默认 30000)。execute 内部 fetch HTML → cheerio 去噪（移除 script/style/nav/footer/iframe）→ turndown 转 Markdown → 截断。导出 `webFetchTool` 常量

## 7. Ask User 工具

- [x] 7.1 实现 `packages/core/src/tools/built-in/ask-user-tool.ts` — 使用 `tool()` + Zod schema 定义，参数：question(string)、options(array, 可选, 每项含 label/description)。execute 通过 ToolRegistry 注册的回调函数获取用户回答。无回调时返回提示信息。导出 `askUserTool` 常量

## 8. ToolRegistry

- [x] 8.1 实现 `packages/core/src/tools/tool-registry.ts` — ToolRegistry 类，包含 register(name, tool)、getTool(name)、getAllTools()、getToolsForAgent(agentType) 方法。定义 AGENT_TOOL_WHITELIST 常量：explore/plan 只有 file+glob+grep+web-search+web-fetch，general 有全部工具。支持 registerBuiltInTools() 批量注册 7 个内置工具
- [x] 8.2 实现 memory-tools 适配 — 在 ToolRegistry 中添加 registerMemoryTools(memoryRepository) 方法，将现有 remember/recall/forget 包装为 AI SDK Tool 格式并注册

## 9. LLMRuntime 改造

- [x] 9.1 修改 `packages/core/src/agents/runtime/types.ts` — 在 RuntimeConfig 中将 `tools` 类型从 `Record<string, AITool>` 改为 `Record<string, Tool>`（AI SDK 标准格式）。移除 `AITool` 接口定义
- [x] 9.2 修改 `packages/core/src/agents/runtime/LLMRuntime.ts` — 移除 `convertTools()` 方法，`runGenerate()` 和 `runStreaming()` 直接传递 config.tools 给 AI SDK 的 generateText/streamText

## 10. AgentRunner 集成

- [x] 10.1 修改 `packages/core/src/agents/core/runner.ts` — AgentRunner 构造函数中创建 ToolRegistry 实例并调用 registerBuiltInTools()。executeWithConfig() 中使用 ToolRegistry.getToolsForAgent() 获取工具集传递给 LLMRuntime
- [x] 10.2 修改 `packages/core/src/agents/capabilities/SubAgentCapability.ts` — runWithHooks() 方法中将 agentType 传递给 runner，确保子 Agent 按类型获取正确的工具集

## 11. 导出与测试

- [x] 11.1 更新 `packages/core/src/tools/index.ts` — 导出 ToolRegistry、所有内置工具常量、工具类型定义
- [x] 11.2 更新 `packages/core/src/index.ts` — 确保新工具模块正确导出
- [x] 11.3 为 bash-tool 编写单元测试：成功执行、超时、危险命令拒绝、输出截断
- [x] 11.4 为 file-tool 编写单元测试：view、create、str_replace、敏感文件保护、文件不存在
- [x] 11.5 为 glob-tool 和 grep-tool 编写单元测试：匹配、无结果、截断
- [x] 11.6 为 web-search-tool 编写单元测试：成功搜索、无结果、网络错误
- [x] 11.7 为 web-fetch-tool 编写单元测试：成功抓取、内容截断、无效 URL
- [x] 11.8 为 ToolRegistry 编写单元测试：注册/查询、agent 类型工具分配、自定义工具、memory-tools 集成
- [x] 11.9 更新现有 runner 测试和 capability 测试适配新的工具格式
- [x] 11.10 运行 `pnpm --filter @hive/core test` 确保全部测试通过
