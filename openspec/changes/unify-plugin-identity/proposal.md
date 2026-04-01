## Why

插件身份标识在注册表、配置文件、运行时实例三处使用不同的 key（registry key `"feishu"`、config key `"@bundy-lmw/hive-plugin-feishu"`、manifest name `"@bundy-lmw/hive-plugin-feishu"`），导致：
1. 管理面板更新配置后 reload 失败 — `pluginInstances` 用 manifest name 存、用 registry key 查，找不到实例
2. reload 时 config 读取 key 不匹配 — `pluginConfigs["feishu"]` 拿到空配置
3. `pluginInstances` Map 是 `ServerImpl.plugins` 的冗余拷贝，两份数据不同步

## What Changes

- **新增 `hive.id` 字段**：package.json 的 `hive` 对象新增 `id` 字段作为插件唯一标识，manifest 继承此字段
- **Server 接口扩展**：新增 `getPlugin(id)` / `replacePlugin(id, plugin)` 方法
- **删除 `pluginInstances`**：PluginHandler 不再维护冗余 Map，直接通过 `Server.getPlugin()` 查找
- **统一 config key**：hive.config.json 的 `plugins` 字段改用 `metadata.id` 作为 key
- **统一安装写入**：`appendToConfig` 改用 `hive.id` 作为 key

## Capabilities

### New Capabilities

_无新能力_

### Modified Capabilities

- `plugin-identity`: 插件身份标识体系统一为 `hive.id`（即 `metadata.id`），全链路单一 key

## Impact

- **packages/core**: Server 接口新增 2 个方法，ServerImpl 新增实现
- **apps/server**: PluginHandler 删除 ~30 行（pluginInstances、setPlugins、scanPluginDir），AdminWsHandler 删除 setPlugins，main.ts 删除一行调用
- **apps/server**: plugins.ts loadFromDirectory config 匹配改为用 manifest.id
- **apps/server**: installer.ts appendToConfig key 改为用 hive.id
- **packages/plugins/feishu**: package.json 新增 `hive.id`
- **apps/server**: hive.config.json / hive.config.example.json plugins key 迁移

## Non-goals

- 不重构插件加载流程（loadPlugins / loadFromDirectory / loadFromNpm 整体架构不变）
- 不修改 IPlugin 接口（PluginMetadata 已有 id 字段，无需变更）
- 不修改 registry 的 key（registry key 和 hive.id 当前值相同，保持现状）
- 不做前端管理面板适配（前端传的 pluginId 已是 registry key，与 hive.id 一致）
