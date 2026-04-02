## ADDED Requirements

### Requirement: Native app category support
系统 SHALL 支持 `native-app` 作为 `ToolCategory` 类型，与 `runtime`、`system` 等现有 category 并列。

#### Scenario: Category type includes native-app
- **WHEN** `ToolCategory` 类型被定义
- **THEN** 类型中 SHALL 包含 `'native-app'` 值

### Requirement: Dynamic native app discovery
系统 SHALL 在运行时通过扫描平台特定目录动态发现已安装的原生应用，而非依赖硬编码的静态注册表。

#### Scenario: macOS discovers apps from /Applications
- **WHEN** 平台为 `darwin` 且扫描开始
- **THEN** 系统 SHALL 扫描 `/Applications`、`/System/Applications` 和 `~/Applications` 目录中的 `.app` bundles
- **AND** 从 `.app` 文件名中提取应用显示名（去除 `.app` 后缀）

#### Scenario: Windows discovers apps from Start Menu
- **WHEN** 平台为 `win32` 且扫描开始
- **THEN** 系统 SHALL 枚举 Start Menu 目录中的 `.lnk` 快捷方式
- **AND** 从快捷方式文件名中提取应用显示名

#### Scenario: Linux discovers apps from .desktop files
- **WHEN** 平台为 `linux` 且扫描开始
- **THEN** 系统 SHALL 解析 `/usr/share/applications/` 和 `~/.local/share/applications/` 中的 `.desktop` 文件
- **AND** 从 `Name=` 字段中提取应用显示名

#### Scenario: Discovery is fast
- **WHEN** 原生应用发现执行
- **THEN** 发现过程 SHALL 在 1 秒内完成（纯文件系统操作）

#### Scenario: Maximum app limit
- **WHEN** 发现的应用数量超过 200
- **THEN** 系统 SHALL 只保留前 200 个应用条目

### Requirement: Platform-level access command template
系统 SHALL 为每个平台定义一个通用的访问命令模板，适用于所有发现的原生应用。

#### Scenario: macOS access command template
- **WHEN** 平台为 `darwin` 且应用名为 `Notes`
- **THEN** 生成的访问命令 SHALL 为 `osascript -e 'tell application "Notes"'`

#### Scenario: Windows access command template
- **WHEN** 平台为 `win32` 且应用名为 `Notepad`
- **THEN** 生成的访问命令 SHALL 为 `start "" "Notepad"`

#### Scenario: Linux access command template
- **WHEN** 平台为 `linux` 且应用名为 `GNOME Notes`
- **THEN** 生成的访问命令 SHALL 使用 `gio launch` 或直接命令名

#### Scenario: No per-app hardcoding
- **WHEN** 新应用安装到系统中
- **THEN** 下次扫描时 SHALL 自动发现该应用，无需任何代码变更

### Requirement: Native app stored with access command
原生应用条目的 `path` 字段 SHALL 存储基于平台模板生成的访问命令。

#### Scenario: macOS Notes.app path field
- **WHEN** Notes.app 被发现并写入数据库
- **THEN** `path` 字段 SHALL 包含 `osascript -e 'tell application "Notes"'`

#### Scenario: Agent queries native apps
- **WHEN** Agent 调用 `env(category="native-app")`
- **THEN** 返回结果 SHALL 包含应用名称、category、访问命令

### Requirement: Integration with scanEnvironment
原生应用发现 SHALL 集成到现有的 `scanEnvironment()` 流程中，与 PATH 扫描并发执行。

#### Scenario: Native app scan runs concurrently with PATH scan
- **WHEN** `scanEnvironment(dbPath)` 被调用
- **THEN** PATH 扫描和原生应用发现 SHALL 并发执行，结果写入同一个数据库

#### Scenario: Native app scan failure does not block PATH scan
- **WHEN** 原生应用发现过程中出现错误
- **THEN** PATH 扫描结果 SHALL 不受影响

### Requirement: env-tool supports native-app query
env-tool 的 category 参数 SHALL 支持 `native-app` 值。

#### Scenario: Query by native-app category
- **WHEN** Agent 调用 `env(category="native-app")`
- **THEN** 返回所有已发现的原生应用条目

#### Scenario: Query by keyword matches native app name
- **WHEN** Agent 调用 `env(query="notes")`
- **THEN** 如果 `Notes` 已被发现，SHALL 返回对应条目

#### Scenario: Native app output format
- **WHEN** env-tool 返回 native-app category 的结果
- **THEN** 每个条目的 `path` 字段 SHALL 显示为 `access: \`command\``

### Requirement: env-tool overview mode (no parameters)
env-tool SHALL 支持不传任何参数的调用，返回所有 category 的摘要信息。

#### Scenario: Agent calls env() with no parameters
- **WHEN** Agent 调用 `env()` 不传 `query` 也不传 `category`
- **THEN** 返回所有 category 的名称和工具数量，按数量降序排列

#### Scenario: Overview includes native-app category
- **WHEN** 原生应用发现完成且存在已发现的应用
- **THEN** 概览结果中 SHALL 包含 `native-app` category 及其工具数量

#### Scenario: Overview suggests usage
- **WHEN** Agent 收到概览结果
- **THEN** 结果末尾 SHALL 包含使用提示，说明如何按 category 或 keyword 查询具体工具

### Requirement: Prompt methodology guidance
system prompt 的 Environment section SHALL 包含方法论引导，鼓励 Agent 在执行不熟悉任务时先了解环境。

#### Scenario: Environment section includes guidance sentence
- **WHEN** system prompt 的 Environment section 被构建
- **THEN** SHALL 包含引导 Agent 先调用 env() 了解环境的方法论提示

#### Scenario: Guidance is platform-agnostic
- **WHEN** 在任何平台上构建 system prompt
- **THEN** 引导内容 SHALL 不包含任何平台特定知识或 category 硬编码列表
