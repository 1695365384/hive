## 1. Manifest 层：新增 hive.id 字段

- [x] 1.1 PluginManifest 类型新增 `id?: string` 字段（apps/server/src/plugins.ts）
- [x] 1.2 manifest 解析时读取 `pkgJson.hive.id`，回退到从 name 提取（去掉 `@bundy-lmw/hive-plugin-` 前缀）
- [x] 1.3 飞书插件 package.json 新增 `"hive": { "id": "feishu" }`
- [x] 1.4 验证：单元测试确认 manifest.id 正确解析

## 2. Config 层：统一 config key 为 manifest.id

- [x] 2.1 loadFromDirectory 改为用 `manifest.id` 匹配 pluginConfigs（替代 manifest.name）
- [x] 2.2 loadFromNpm 改为用 `manifest.id` 匹配 pluginConfigs（从 PluginClass 实例读 metadata.id）
- [x] 2.3 appendToConfig 改为用 hive.id 作为 key（installer.ts）
- [x] 2.4 hive.config.json 和 hive.config.example.json 的 plugins key 从 `"@bundy-lmw/hive-plugin-feishu"` 改为 `"feishu"`
- [x] 2.5 验证：确认初始加载时插件能正确读取配置

## 3. Server 层：新增 getPlugin / replacePlugin

- [x] 3.1 Server 接口（types.ts）新增 `getPlugin(id)` 和 `replacePlugin(id, plugin)` 方法签名
- [x] 3.2 ServerImpl 实现 getPlugin（从 this.plugins 按 metadata.id 查找）
- [x] 3.3 ServerImpl 实现 replacePlugin（替换数组元素，不存在则 push）
- [x] 3.4 验证：单元测试确认 getPlugin/replacePlugin 行为正确

## 4. PluginHandler 层：删除 pluginInstances

- [x] 4.1 删除 PluginHandler 的 `pluginInstances` Map 和 `setPlugins()` 方法
- [x] 4.2 删除 PluginHandler 的 `scanPluginDir` import
- [x] 4.3 删除 AdminWsHandler 的 `setPlugins()` 方法和 `IPlugin` import
- [x] 4.4 删除 main.ts 中 `adminHandler.setPlugins(context.plugins)` 调用
- [x] 4.5 验证：构建通过

## 5. reloadPlugin 重写

- [x] 5.1 reloadPlugin 改为通过 `server.getPlugin(pluginId)` 查找旧实例
- [x] 5.2 reloadPlugin 的 config 读取改为 `pluginConfigs[pluginId]`（直接用 metadata.id）
- [x] 5.3 reloadPlugin 新实例创建后通过 `server.replacePlugin(pluginId, newPlugin)` 替换
- [x] 5.4 实现 swap 模式：先创建新实例，成功后再销毁旧实例
- [x] 5.5 reloadPlugin 不再扫描 manifest 文件系统（从 registry 反查 entry 路径，或从旧插件 manifest 获取）
- [x] 5.6 验证：全量测试通过

## 6. 集成验证

- [x] 6.1 TypeScript 类型检查通过
- [x] 6.2 `npx vitest run` 全量测试通过（83 files / 1285 tests）
- [x] 6.3 `pnpm test` 通过（61 files）
- [x] 6.4 桌面端启动验证：插件加载、管理面板配置更新、reload 无报错
