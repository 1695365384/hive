## 1. 插件目录扫描

- [x] 1.1 在 `apps/server/src/plugins.ts` 中实现 `scanPluginDir()` 函数：扫描 `.hive/plugins/` 子目录，读取 `package.json`，校验 `hive.plugin === true`，返回 `{ dir, entry, config }[]`
- [x] 1.2 实现从目录加载插件：对每个扫描结果 `await import(entryPath)`，取 `mod.default` 实例化，传入 `config.json` 或 `{}`

## 2. 合并加载逻辑

- [x] 2.1 重构 `loadPlugins()`：先目录扫描加载，再 npm 动态 import，合并结果（目录优先），返回 `IPlugin[]`

## 3. 验证

- [x] 3.1 构建通过（core + feishu + server）
- [x] 3.2 `.hive/plugins/` 目录不存在时正常启动（返回空数组）
