## MODIFIED Requirements

### Requirement: Bash tool for command execution
系统 SHALL 提供 `bash` 内置工具，允许 Agent 执行 shell 命令。工具 SHALL 接受 `command` 字符串参数和可选的 `timeout` 参数（默认 120 秒）。执行结果 SHALL 捕获 stdout 和 stderr，合并返回。超时时 SHALL 中止进程并返回错误信息。命令输出超过 `maxOutputLength`（默认 30000 字符）时 SHALL 截断并附加截断提示。

#### Scenario: Successful command execution
- **WHEN** Agent 调用 bash 工具，command 为 "ls -la"
- **THEN** 工具 SHALL 返回 stdout 内容，包含文件列表

#### Scenario: Command timeout
- **WHEN** Agent 调用 bash 工具，command 为 "sleep 300"，timeout 为 5000
- **THEN** 工具 SHALL 在 5 秒后终止进程，返回超时错误信息

#### Scenario: Command output truncation
- **WHEN** 命令输出超过 30000 字符
- **THEN** 工具 SHALL 截断输出，返回前 30000 字符 + "[输出已截断，共 N 字符]"

#### Scenario: Dangerous command rejection
- **WHEN** Agent 调用 bash 工具，command 匹配危险模式（如 `rm -rf /`）
- **THEN** 工具 SHALL 拒绝执行，返回安全错误信息

### Requirement: File tool for file operations
系统 SHALL 提供 `file` 内置工具，支持通过 `command` 参数执行文件操作。支持的 command 值：`view`（读取文件内容）、`create`（创建新文件）、`str_replace`（替换文件中的文本）、`insert`（在指定位置插入文本）。工具 SHALL 接受 `file_path` 参数标识目标文件。读取操作 SHALL 支持 `offset`（起始行号）和 `limit`（最大行数）参数。所有写操作 SHALL 在写之前检查文件路径不在敏感文件保护列表中（.env、.ssh、credentials 等）。

#### Scenario: View file content
- **WHEN** Agent 调用 file 工具，command 为 "view"，file_path 为 "/path/to/file.ts"
- **THEN** 工具 SHALL 返回文件完整内容，格式为 "行号: 内容"

#### Scenario: View file with offset and limit
- **WHEN** Agent 调用 file 工具，command 为 "view"，offset 为 10，limit 为 20
- **THEN** 工具 SHALL 返回第 10-29 行的内容

#### Scenario: Create new file
- **WHEN** Agent 调用 file 工具，command 为 "create"，file_path 为 "/path/to/new.ts"，content 为 "export const x = 1"
- **THEN** 工具 SHALL 创建文件并写入指定内容

#### Scenario: Str_replace edit
- **WHEN** Agent 调用 file 工具，command 为 "str_replace"，提供 file_path、old_str、new_str
- **THEN** 工具 SHALL 在文件中查找 old_str 并替换为 new_str

#### Scenario: Sensitive file protection
- **WHEN** Agent 调用 file 工具，file_path 匹配敏感文件模式（如 .env、id_rsa）
- **THEN** 工具 SHALL 拒绝操作，返回安全错误信息

#### Scenario: File not found
- **WHEN** Agent 调用 file 工具，file_path 指向不存在的文件
- **THEN** 工具 SHALL 返回明确的文件不存在错误信息

### Requirement: Glob tool for file pattern matching
系统 SHALL 提供 `glob` 内置工具，支持按 glob 模式搜索文件路径。工具 SHALL 接受 `pattern` 字符串参数（如 `**/*.ts`、`src/**/*.py`）。返回值 SHALL 为匹配的文件路径列表，按修改时间排序。结果超过 `maxResults`（默认 100）时 SHALL 截断。

#### Scenario: Match TypeScript files
- **WHEN** Agent 调用 glob 工具，pattern 为 "**/*.ts"
- **THEN** 工具 SHALL 返回所有 .ts 文件的路径列表

#### Scenario: No matches
- **WHEN** Agent 调用 glob 工具，pattern 为 "**/*.xyz"
- **THEN** 工具 SHALL 返回空数组

#### Scenario: Result truncation
- **WHEN** 匹配结果超过 100 个文件
- **THEN** 工具 SHALL 返回前 100 个结果 + "[共 N 个匹配，已截断]"

### Requirement: Grep tool for content search
系统 SHALL 提供 `grep` 内置工具，支持用正则表达式搜索文件内容。工具 SHALL 接受 `pattern`（正则表达式）和可选的 `path`（搜索目录）、`glob`（文件类型过滤，如 `*.ts`）、`maxResults`（最大结果数，默认 50）参数。返回值 SHALL 包含匹配的文件路径、行号和匹配内容。

#### Scenario: Search for function definition
- **WHEN** Agent 调用 grep 工具，pattern 为 "function handleSubmit"
- **THEN** 工具 SHALL 返回包含该模式的所有文件路径、行号和匹配行内容

#### Scenario: Search with file type filter
- **WHEN** Agent 调用 grep 工具，pattern 为 "import.*React"，glob 为 "*.tsx"
- **THEN** 工具 SHALL 只搜索 .tsx 文件

#### Scenario: Case insensitive search
- **WHEN** Agent 调用 grep 工具，pattern 为 "TODO"，caseInsensitive 为 true
- **THEN** 工具 SHALL 匹配 "TODO"、"todo"、"Todo" 等变体

### Requirement: Web search tool using DuckDuckGo Lite
系统 SHALL 提供 `web-search` 内置工具，使用 DuckDuckGo Lite 搜索网页。工具 SHALL 接受 `query` 字符串参数。工具 SHALL 抓取 `https://lite.duckduckgo.com/lite/?q=...` 的 HTML 页面，解析搜索结果（标题、URL、摘要）。返回值 SHALL 为搜索结果数组，每项包含 title、url、snippet 字段。搜索失败时 SHALL 返回空数组和错误提示，不阻塞 Agent 流程。

#### Scenario: Successful web search
- **WHEN** Agent 调用 web-search 工具，query 为 "TypeScript 5.0 new features"
- **THEN** 工具 SHALL 返回搜索结果数组，每项包含 title、url、snippet

#### Scenario: No results found
- **WHEN** Agent 调用 web-search 工具，query 为无意义字符串
- **THEN** 工具 SHALL 返回空数组

#### Scenario: Network error
- **WHEN** DuckDuckGo Lite 请求失败（网络不可用、DNS 错误等）
- **THEN** 工具 SHALL 返回空数组 + 错误信息，不抛出异常

### Requirement: Web fetch tool for URL content retrieval
系统 SHALL 提供 `web-fetch` 内置工具，抓取指定 URL 的网页内容并转换为 Markdown。工具 SHALL 接受 `url` 字符串参数和可选的 `maxChars`（默认 30000）参数。工具 SHALL 使用 fetch 获取 HTML，用 cheerio 去除 script/style/nav/footer/iframe 等噪音元素，用 turndown 转换为 Markdown。转换后内容超过 maxChars 时 SHALL 截断并附加截断提示。

#### Scenario: Fetch and convert webpage
- **WHEN** Agent 调用 web-fetch 工具，url 为 "https://example.com/docs"
- **THEN** 工具 SHALL 返回该页面的 Markdown 格式内容

#### Scenario: Content truncation
- **WHEN** 页面 Markdown 内容超过 30000 字符
- **THEN** 工具 SHALL 返回前 30000 字符 + "[内容已截断，共 N 字符]"

#### Scenario: Invalid URL
- **WHEN** Agent 调用 web-fetch 工具，url 为 "not-a-url"
- **THEN** 工具 SHALL 返回错误信息

#### Scenario: Fetch failure
- **WHEN** URL 不可达（404、网络错误等）
- **THEN** 工具 SHALL 返回错误信息，不抛出异常

### Requirement: Ask user tool for clarification
系统 SHALL 提供 `ask-user` 内置工具，允许 Agent 向用户提出澄清问题。工具 SHALL 接受 `question`（问题文本）和可选的 `options`（多选选项数组，每项含 label 和 description）参数。工具 SHALL 通过回调函数将问题传递给调用方，返回用户的回答。如果调用方未注册回调，SHALL 返回 "[ask-user: 无回调注册，无法向用户提问]"。

#### Scenario: Ask question with options
- **WHEN** Agent 调用 ask-user 工具，question 为 "使用哪个数据库？"，options 为 [{label: "PostgreSQL"}, {label: "SQLite"}]
- **THEN** 工具 SHALL 通过回调传递问题，返回用户选择的选项 label

#### Scenario: Ask question without options
- **WHEN** Agent 调用 ask-user 工具，question 为 "请描述你的需求"，不提供 options
- **THEN** 工具 SHALL 通过回调传递问题，返回用户的自由文本回答

#### Scenario: No callback registered
- **WHEN** ask-user 工具被调用但未注册回调
- **THEN** 工具 SHALL 返回提示信息，不抛出异常

### Requirement: Unified output safety limits
所有内置工具 SHALL 统一遵守输出安全限制：默认最大输出长度 30000 字符，超出时截断并附加格式化的截断提示（包含原始长度信息）。截断行为 SHALL 在 execute 函数内部实现，不依赖外部 hook。

#### Scenario: Bash output exceeds limit
- **WHEN** bash 命令输出 50000 字符
- **THEN** 工具 SHALL 返回 30000 字符 + "[输出已截断，共 50000 字符]"

#### Scenario: File content exceeds limit
- **WHEN** 读取的文件内容超过 30000 字符
- **THEN** 工具 SHALL 返回 30000 字符 + 截断提示

#### Scenario: Output within limit
- **WHEN** 工具输出 10000 字符
- **THEN** 工具 SHALL 返回完整内容，不附加截断提示

## ADDED Requirements

### Requirement: ToolRegistry agent type whitelist consolidation
ToolRegistry SHALL 只定义两种 Agent 类型的工具白名单：`explore`（只读工具）和 `general`（全量工具）。`evaluator` 和 `plan` 类型 SHALL 通过 fallback 映射到 `general` 和 `explore`。

#### Scenario: explore agent gets read-only tools
- **WHEN** `getToolsForAgent('explore')` 被调用
- **THEN** 返回 file(只读)、glob、grep、web-search、web-fetch、env 共 6 个工具

#### Scenario: general agent gets full tools
- **WHEN** `getToolsForAgent('general')` 被调用
- **THEN** 返回 bash、file(全量)、glob、grep、web-search、web-fetch、ask-user、send-file、env 共 9 个工具

#### Scenario: plan falls back to explore
- **WHEN** `getToolsForAgent('plan')` 被调用
- **THEN** 返回与 explore 相同的工具集

#### Scenario: evaluator falls back to general
- **WHEN** `getToolsForAgent('evaluator')` 被调用
- **THEN** 返回与 general 相同的工具集
