## MODIFIED Requirements

### Requirement: Glob tool for file pattern matching
系统 SHALL 提供 `glob` 内置工具，支持按 glob 模式搜索文件路径。工具 SHALL 接受 `pattern` 字符串参数（如 `**/*.ts`、`src/**/*.py`）。返回值 SHALL 为匹配的文件路径列表，按修改时间排序。结果超过 `maxResults`（默认 100）时 SHALL 截断。工具 SHALL 通过 harness 层包装，execute 函数返回 `ToolResult`，由 harness 序列化为 string。

#### Scenario: Match TypeScript files
- **WHEN** Agent 调用 glob 工具，pattern 为 "**/*.ts"
- **THEN** 工具 SHALL 返回所有 .ts 文件的路径列表

#### Scenario: No matches
- **WHEN** Agent 调用 glob 工具，pattern 为 "**/*.xyz"
- **THEN** 工具 SHALL 返回空数组

#### Scenario: Result truncation
- **WHEN** 匹配结果超过 100 个文件
- **THEN** 工具 SHALL 返回前 100 个结果 + "[共 N 个匹配，已截断]"

#### Scenario: Path blocked by security
- **WHEN** Agent 调用 glob 工具，path 指向不允许的工作目录外
- **THEN** 工具 SHALL 返回 `PATH_BLOCKED` 错误码和 hint 提示

### Requirement: Grep tool for content search
系统 SHALL 提供 `grep` 内置工具，支持用正则表达式搜索文件内容。工具 SHALL 接受 `pattern`（正则表达式）和可选的 `path`（搜索目录）、`glob`（文件类型过滤，如 `*.ts`）、`maxResults`（最大结果数，默认 50）参数。返回值 SHALL 包含匹配的文件路径、行号和匹配内容。工具 SHALL 通过 harness 层包装，execute 函数返回 `ToolResult`，由 harness 序列化为 string。

#### Scenario: Search for function definition
- **WHEN** Agent 调用 grep 工具，pattern 为 "function handleSubmit"
- **THEN** 工具 SHALL 返回包含该模式的所有文件路径、行号和匹配行内容

#### Scenario: Search with file type filter
- **WHEN** Agent 调用 grep 工具，pattern 为 "import.*React"，glob 为 "*.tsx"
- **THEN** 工具 SHALL 只搜索 .tsx 文件

#### Scenario: Case insensitive search
- **WHEN** Agent 调用 grep 工具，pattern 为 "TODO"，caseInsensitive 为 true
- **THEN** 工具 SHALL 匹配 "TODO"、"todo"、"Todo" 等变体

#### Scenario: Path blocked by security
- **WHEN** Agent 调用 grep 工具，path 指向不允许的工作目录外
- **THEN** 工具 SHALL 返回 `PATH_BLOCKED` 错误码和 hint 提示

#### Scenario: Invalid regex pattern
- **WHEN** Agent 调用 grep 工具，pattern 为无效正则表达式
- **THEN** 工具 SHALL 返回 `INVALID_PARAM` 错误码和 hint 提示

### Requirement: Web search tool using DuckDuckGo Lite
系统 SHALL 提供 `web-search` 内置工具，使用 DuckDuckGo Lite 搜索网页。工具 SHALL 接受 `query` 字符串参数。工具 SHALL 抓取 `https://lite.duckduckgo.com/lite/?q=...` 的 HTML 页面，解析搜索结果（标题、URL、摘要）。工具 SHALL 通过 harness 层包装，execute 函数返回 `ToolResult`，由 harness 序列化为 string。网络错误 SHALL 返回 `NETWORK` 错误码，触发 harness 自动重试（最多 2 次，指数退避）。

#### Scenario: Successful web search
- **WHEN** Agent 调用 web-search 工具，query 为 "TypeScript 5.0 new features"
- **THEN** 工具 SHALL 返回搜索结果数组，每项包含 title、url、snippet

#### Scenario: No results found
- **WHEN** Agent 调用 web-search 工具，query 为无意义字符串
- **THEN** 工具 SHALL 返回空结果

#### Scenario: Network error with auto-retry
- **WHEN** DuckDuckGo Lite 请求失败（HTTP 5xx、网络超时等）
- **THEN** 工具 SHALL 返回 `NETWORK` 错误码
- **AND** harness SHALL 自动重试最多 2 次（指数退避 500ms、1000ms）

### Requirement: Web fetch tool for URL content retrieval
系统 SHALL 提供 `web-fetch` 内置工具，抓取指定 URL 的网页内容并转换为 Markdown。工具 SHALL 接受 `url` 字符串参数和可选的 `maxChars`（默认 30000）参数。工具 SHALL 使用 fetch 获取 HTML，用 cheerio 去除噪音元素，用 turndown 转换为 Markdown。工具 SHALL 通过 harness 层包装，execute 函数返回 `ToolResult`，由 harness 序列化为 string。HTTP 错误 SHALL 返回 `NETWORK` 错误码，触发自动重试。

#### Scenario: Fetch and convert webpage
- **WHEN** Agent 调用 web-fetch 工具，url 为 "https://example.com/docs"
- **THEN** 工具 SHALL 返回该页面的 Markdown 格式内容

#### Scenario: Content truncation
- **WHEN** 页面 Markdown 内容超过 maxChars
- **THEN** 工具 SHALL 截断并附加截断提示

#### Scenario: Invalid URL
- **WHEN** Agent 调用 web-fetch 工具，url 为 "not-a-url"
- **THEN** 工具 SHALL 返回 `INVALID_PARAM` 错误码和 hint

#### Scenario: SSRF blocked
- **WHEN** Agent 调用 web-fetch 工具，url 指向内网地址
- **THEN** 工具 SHALL 返回 `PATH_BLOCKED` 错误码

#### Scenario: HTTP error with auto-retry
- **WHEN** URL 请求返回 5xx 或网络错误
- **THEN** 工具 SHALL 返回 `NETWORK` 错误码
- **AND** harness SHALL 自动重试最多 2 次

### Requirement: Ask user tool for clarification
系统 SHALL 提供 `ask-user` 内置工具，允许 Agent 向用户提出澄清问题。工具 SHALL 接受 `question`（问题文本）和可选的 `options`（多选选项数组）参数。工具 SHALL 通过 harness 层包装，execute 函数返回 `ToolResult`，由 harness 序列化为 string。无回调注册时 SHALL 返回 `PERMISSION` 错误码。回调异常时 SHALL 返回 `EXEC_ERROR` 错误码。ask-user 不触发自动重试。

#### Scenario: Ask question with options
- **WHEN** Agent 调用 ask-user 工具，提供 question 和 options
- **THEN** 工具 SHALL 通过回调传递问题，返回用户回答

#### Scenario: No callback registered
- **WHEN** ask-user 工具被调用但未注册回调
- **THEN** 工具 SHALL 返回 `PERMISSION` 错误码和 hint

#### Scenario: Callback error
- **WHEN** 回调函数抛出异常
- **THEN** 工具 SHALL 返回 `EXEC_ERROR` 错误码
