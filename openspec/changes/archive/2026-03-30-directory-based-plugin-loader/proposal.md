## Why

当前插件系统依赖 npm 安装 + 手动编辑 hive.config.json。用户添加新插件需要 npm 环境、手动修改配置文件，且插件配置与主配置耦合。需要一种更直观的插件分发方式：将打包产物（ZIP）解压到插件目录即可加载，实现"拷贝即安装"。

## What Changes

- 新增 `.hive/plugins/` 目录作为插件存放位置
- 插件包通过 `package.json` 中的 `"hive": { "plugin": true }` 声明身份
- Server 启动时扫描 `.hive/plugins/`，自动发现并加载所有合法插件
- 每个插件自带 `config.json` 存放配置，与主配置解耦
- 保留 npm 动态加载模式作为兼容路径

## Capabilities

### New Capabilities
- `plugin-scanner`: 扫描 `.hive/plugins/` 目录，发现合法插件包并读取元信息和配置

### Modified Capabilities
- `plugin-loader`: 加载逻辑从仅支持 npm 包名扩展为同时支持本地文件路径 import
- `plugin-interface`: 插件包需在 `package.json` 中声明 `"hive": { "plugin": true, "entry": "dist/index.js" }`；自带 `config.json`

## Impact

- **`apps/server/src/plugins.ts`** — 扩展 `loadPlugins()`，增加目录扫描 + 本地 import
- **`apps/server/src/config.ts`** — `pluginConfigs` 可能不再作为主要配置来源
- **`.hive/plugins/`** — 新增目录结构
- **`packages/core/*`** — 不受影响
