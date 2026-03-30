## 1. 插件包约定

- [x] 1.1 `packages/plugins/feishu/src/index.ts` 添加 `export { FeishuPlugin as default }`

## 2. 动态加载实现

- [x] 2.1 重写 `apps/server/src/plugins.ts`：将静态 import 改为 async 函数 `loadPlugins()`，读取 `pluginConfigs`，循环 `await import(name)` 取 `mod.default` 实例化，失败时 log error 并跳过
- [x] 2.2 更新 `apps/server/src/bootstrap.ts`：`import { plugins }` 改为 `import { loadPlugins }` 并 `await loadPlugins()`
