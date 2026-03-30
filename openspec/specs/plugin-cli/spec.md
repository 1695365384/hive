## ADDED Requirements

### Requirement: plugin 子命令路由
系统 SHALL 在 `hive` CLI 下注册 `plugin` 子命令，支持嵌套子命令路由。

#### Scenario: 显示 plugin 帮助
- **WHEN** 用户执行 `hive plugin` 或 `hive plugin --help`
- **THEN** 展示所有子命令及用法说明：search、add、list、remove、info、update

#### Scenario: 未知子命令
- **WHEN** 用户执行 `hive plugin foo`（不存在的子命令）
- **THEN** 展示错误信息"Unknown command: foo"并列出可用子命令

### Requirement: search 子命令
系统 SHALL 支持 `hive plugin search [keyword]` 命令。

#### Scenario: 带关键词搜索
- **WHEN** 用户执行 `hive plugin search feishu`
- **THEN** 调用搜索服务，格式化展示结果

#### Scenario: 不带关键词列出全部
- **WHEN** 用户执行 `hive plugin search`
- **THEN** 列出所有 `@hive/plugin-*` 插件

### Requirement: add 子命令
系统 SHALL 支持 `hive plugin add <source>` 命令。

#### Scenario: 安装插件
- **WHEN** 用户执行 `hive plugin add @bundy-lmw/hive-plugin-feishu`
- **THEN** 调用安装服务，展示安装进度和结果

#### Scenario: 缺少 source 参数
- **WHEN** 用户执行 `hive plugin add`（不带参数）
- **THEN** 展示错误信息"Usage: hive plugin add <package|git-url|local-path>"

### Requirement: list 子命令
系统 SHALL 支持 `hive plugin list` 命令。

#### Scenario: 列出插件
- **WHEN** 用户执行 `hive plugin list`
- **THEN** 展示已安装插件列表

### Requirement: remove 子命令
系统 SHALL 支持 `hive plugin remove <name>` 命令。

#### Scenario: 卸载插件
- **WHEN** 用户执行 `hive plugin remove feishu`
- **THEN** 调用卸载逻辑，展示结果

#### Scenario: 缺少 name 参数
- **WHEN** 用户执行 `hive plugin remove`（不带参数）
- **THEN** 展示错误信息"Usage: hive plugin remove <name>"

### Requirement: info 子命令
系统 SHALL 支持 `hive plugin info <name>` 命令。

#### Scenario: 查看详情
- **WHEN** 用户执行 `hive plugin info feishu`
- **THEN** 展示插件详细信息

### Requirement: update 子命令
系统 SHALL 支持 `hive plugin update [name]` 命令。

#### Scenario: 更新指定插件
- **WHEN** 用户执行 `hive plugin update feishu`
- **THEN** 检查并更新指定插件

#### Scenario: 更新所有插件
- **WHEN** 用户执行 `hive plugin update`（不带参数）
- **THEN** 检查并更新所有已安装插件

### Requirement: CLI 框架迁移
现有 `apps/server/src/cli/index.ts` SHALL 从手写 parseArgs 迁移到 commander，保持 `chat`、`server` 命令向后兼容。

#### Scenario: 现有命令不受影响
- **WHEN** 用户执行 `hive chat` 或 `hive server`
- **THEN** 行为与迁移前完全一致

#### Scenario: --help 和 --version 保持
- **WHEN** 用户执行 `hive --help` 或 `hive --version`
- **THEN** 展示与迁移前一致的输出
