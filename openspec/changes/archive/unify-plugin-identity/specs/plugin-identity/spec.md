## ADDED Requirements

### Requirement: Plugin manifest SHALL include hive.id field
package.json 的 `hive` 对象 SHALL 包含 `id` 字段，作为插件的唯一程序标识符。manifest 解析时 SHALL 继承此字段为 `manifest.id`。

#### Scenario: Package with hive.id defined
- **WHEN** package.json 包含 `"hive": { "plugin": true, "id": "feishu" }`
- **THEN** manifest.id SHALL 为 `"feishu"`

#### Scenario: Package without hive.id (backward compat)
- **WHEN** package.json 包含 `"hive": { "plugin": true }` 但没有 `id` 字段
- **THEN** manifest.id SHALL 回退到从 package.json name 提取（去掉 `@bundy-lmw/hive-plugin-` 前缀）

### Requirement: Server SHALL expose getPlugin and replacePlugin methods
Server 接口 SHALL 提供 `getPlugin(id: string)` 和 `replacePlugin(id: string, plugin: IPlugin)` 方法，通过 `metadata.id` 查找和替换插件实例。

#### Scenario: Find existing plugin by id
- **WHEN** Server 已加载 id 为 `"feishu"` 的插件
- **THEN** `server.getPlugin("feishu")` SHALL 返回该 IPlugin 实例

#### Scenario: Find non-existent plugin
- **WHEN** Server 没有 id 为 `"nonexistent"` 的插件
- **THEN** `server.getPlugin("nonexistent")` SHALL 返回 `undefined`

#### Scenario: Replace plugin instance
- **WHEN** 调用 `server.replacePlugin("feishu", newPlugin)`
- **THEN** `server.getPlugin("feishu")` SHALL 返回 `newPlugin`
- **AND** Server.stop() 时 SHALL 调用 newPlugin.deactivate() 和 newPlugin.destroy()

### Requirement: PluginHandler SHALL NOT maintain redundant plugin state
PluginHandler SHALL NOT 维护独立的 `pluginInstances` Map。所有插件查找 SHALL 通过 `Server.getPlugin()` 完成，插件替换 SHALL 通过 `Server.replacePlugin()` 完成。

#### Scenario: reloadPlugin finds plugin via Server
- **WHEN** 调用 reloadPlugin("feishu")
- **THEN** SHALL 通过 `server.getPlugin("feishu")` 查找旧实例
- **AND** SHALL 通过 `server.replacePlugin("feishu", newPlugin)` 替换为新实例

#### Scenario: reloadPlugin with non-existent plugin
- **WHEN** 调用 reloadPlugin("nonexistent") 且 Server 中无此插件
- **THEN** SHALL 打印警告日志并直接返回

### Requirement: Plugin config key SHALL use metadata.id
hive.config.json 的 `plugins` 字段 SHALL 以 `metadata.id`（即 `hive.id`）作为 key。loadFromDirectory、handleUpdateConfig、reloadPlugin、appendToConfig SHALL 统一使用此 key。

#### Scenario: Load plugin config by metadata.id
- **WHEN** hive.config.json 包含 `{ "plugins": { "feishu": { "apps": [...] } } }`
- **AND** 插件的 manifest.id 为 `"feishu"`
- **THEN** loadFromDirectory SHALL 将 `{ "apps": [...] }` 作为配置传入插件构造函数

#### Scenario: Update config writes with metadata.id key
- **WHEN** 管理面板调用 plugin.updateConfig 传入 id="feishu" 和新配置
- **THEN** hive.config.json 的 plugins key SHALL 为 `"feishu"`（非 npm 包名）

#### Scenario: reloadPlugin reads config by metadata.id
- **WHEN** reloadPlugin("feishu") 执行
- **THEN** SHALL 从 `pluginConfigs["feishu"]` 读取配置（非 `"@bundy-lmw/hive-plugin-feishu"`）

### Requirement: reloadPlugin SHALL use swap pattern
reloadPlugin SHALL 先创建并验证新实例，成功后再销毁旧实例。如果新实例创建失败，旧实例 SHALL 保持运行。

#### Scenario: Successful reload
- **WHEN** reloadPlugin("feishu") 执行且新实例创建成功
- **THEN** 旧实例 SHALL 被 deactivate + destroy
- **AND** 新实例 SHALL 被 initialize + activate
- **AND** server.replacePlugin("feishu", newPlugin) SHALL 被调用

#### Scenario: Failed reload preserves old plugin
- **WHEN** reloadPlugin("feishu") 执行但新实例创建失败（如 import 错误）
- **THEN** 旧实例 SHALL 保持运行（不被 deactivate/destroy）
- **AND** 错误信息 SHALL 被记录
