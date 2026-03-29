## Why

当前插件系统使用静态 import——每新增一个插件都需要修改 `apps/server/src/plugins.ts` 源码并重新构建。用户安装新插件包后无法通过配置直接启用，违反了插件系统"可扩展"的核心价值。

## What Changes

- 将 `apps/server/src/plugins.ts` 从静态 import 改为配置驱动的动态 `import()` 加载
- 插件包遵循约定：导出 default class（实现 `IPlugin` 接口）
- 加载逻辑读取 `hive.config.json` 中的 `plugins` 配置，按名称动态 import 并实例化
- feishu 插件添加 default export 以符合新约定

## Capabilities

### New Capabilities
- `plugin-loader`: 配置驱动的插件动态加载机制——从 hive.config.json 读取插件列表，通过 dynamic import 加载、实例化，传递给 Server

### Modified Capabilities
- `plugin-interface`: `IPlugin` 约定扩展——插件包需提供 default export 供动态加载使用

## Impact

- **`apps/server/src/plugins.ts`** — 重写为动态加载逻辑
- **`packages/plugins/feishu/src/index.ts`** — 添加 default export
- **`packages/core/*`** — 不受影响，仍接收 `IPlugin[]`
- **`hive.config.json`** — 插件配置结构保持不变，`pluginConfigs` 已有正确格式
