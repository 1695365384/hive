## ADDED Requirements

### Requirement: 列出已安装插件
系统 SHALL 通过 `hive plugin list` 展示所有已安装插件的信息。

#### Scenario: 有已安装插件
- **WHEN** `.registry.json` 中有 N 个插件记录
- **THEN** 展示插件名称、版本、来源类型、安装时间，格式化为表格

#### Scenario: 无已安装插件
- **WHEN** `.registry.json` 为空或不存在
- **THEN** 展示"No plugins installed. Use `hive plugin search <keyword>` to discover plugins."

#### Scenario: 目录与注册表不一致
- **WHEN** `.registry.json` 中记录的插件目录不存在（被手动删除）
- **THEN** 标记该插件状态为 "missing"

### Requirement: 卸载插件
系统 SHALL 通过 `hive plugin remove <name>` 卸载已安装插件。

#### Scenario: 卸载已安装插件
- **WHEN** 用户执行 `hive plugin remove feishu`
- **THEN** 从 `.registry.json` 移除记录 → 从 `hive.config.json` 的 `plugins` 字段移除配置 → 删除 `.hive/plugins/feishu/` 目录

#### Scenario: 插件不存在
- **WHEN** 指定的插件名称不在 `.registry.json` 中
- **THEN** 展示错误信息"Plugin not installed"

### Requirement: 查看插件详情
系统 SHALL 通过 `hive plugin info <name>` 展示单个插件的详细信息。

#### Scenario: 查看已安装插件
- **WHEN** 用户执行 `hive plugin info feishu`
- **THEN** 展示插件名称、版本、来源、安装时间、描述（来自 package.json）、配置项（来自 hive.config.json）

#### Scenario: 插件不存在
- **WHEN** 指定的插件名称不在 `.registry.json` 中
- **THEN** 展示错误信息"Plugin not installed"

### Requirement: 更新插件
系统 SHALL 通过 `hive plugin update <name>` 检查并安装插件的新版本。

#### Scenario: 有新版本可用
- **WHEN** npm Registry 上该插件的最新版本高于已安装版本
- **THEN** 展示当前版本和最新版本 → 用户确认 → 执行 `npm install --prefix` 更新 → 更新 `.registry.json`

#### Scenario: 已是最新版本
- **WHEN** 已安装版本等于 npm Registry 上的最新版本
- **THEN** 展示"Already up to date"

#### Scenario: 更新所有插件
- **WHEN** 用户执行 `hive plugin update`（不带名称）
- **THEN** 依次检查所有已安装插件，更新有新版本的插件

### Requirement: 注册表持久化
系统 SHALL 使用 `.hive/plugins/.registry.json` 存储已安装插件的元数据。

#### Scenario: 首次安装写入
- **WHEN** 插件安装成功
- **THEN** 在 `.registry.json` 中写入 `{ "name": { source, installedAt, resolvedVersion } }`

#### Scenario: 注册表不存在时自动创建
- **WHEN** `.hive/plugins/.registry.json` 文件不存在
- **THEN** 自动创建空对象 `{}`

#### Scenario: 注册表损坏时优雅降级
- **WHEN** `.registry.json` 文件内容不是合法 JSON
- **THEN** 展示警告信息，按空注册表处理（不影响 server 启动）
