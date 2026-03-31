## MODIFIED Requirements

### Requirement: plugin 子命令路由
系统 SHALL 在 `hive` CLI 下注册 `plugin` 和 `skill` 子命令，支持嵌套子命令路由。

#### Scenario: 显示 plugin 帮助
- **WHEN** 用户执行 `hive plugin` 或 `hive plugin --help`
- **THEN** 展示所有子命令及用法说明：search、add、list、remove、info、update

#### Scenario: 显示 skill 帮助
- **WHEN** 用户执行 `hive skill` 或 `hive skill --help`
- **THEN** 展示所有子命令及用法说明：add、list、remove

#### Scenario: 未知子命令
- **WHEN** 用户执行 `hive plugin foo`（不存在的子命令）
- **THEN** 展示错误信息"Unknown command: foo"并列出可用子命令
