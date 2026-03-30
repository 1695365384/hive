## Why

当前 Hive 插件系统已支持加载（目录扫描 + npm 动态 import），但缺少**发现、安装、管理**的用户体验。用户需要手动编辑 `hive.config.json`、手动 `npm install`、手动确认包名和版本。需要一个 CLI 命令让插件管理变得像 `npm install` 一样简单。

## What Changes

- 新增 `hive plugin` CLI 子命令：`search`、`add`、`list`、`remove`、`info`、`update`
- 基于 npm Registry API 实现插件搜索（`@hive/plugin-*` scope）
- 实现 npm 包安装到 `.hive/plugins/<name>/` 目录，复用已有 `scanPluginDir()` 加载机制
- 实现 Git URL 安装（`git clone` + `npm install --production`）
- 实现 `.hive/plugins/.registry.json` 记录已安装插件的来源和版本元数据
- CLI 框架从手写 parseArgs 升级为 commander，支持子命令路由

## Capabilities

### New Capabilities
- `plugin-search`: npm Registry API 搜索 + 结果格式化展示
- `plugin-installer`: 多来源安装（npm / Git URL / 本地路径）+ 验证 + 写入配置
- `plugin-manager`: 已安装插件的生命周期管理（list / remove / update / info）
- `plugin-cli`: `hive plugin` 子命令路由（基于 commander）

### Modified Capabilities
- `plugin-loader`: 支持从 npm 安装到 `.hive/plugins/` 的插件目录自动发现加载（当前 `scanPluginDir` 已基本覆盖，需验证 `--prefix` 安装后的目录结构兼容性）

## Impact

- **CLI 入口**: `apps/server/src/cli/index.ts` 需要重构，引入 commander
- **新增模块**: `apps/server/src/plugin-manager/` 目录（searcher、installer、manager、cli）
- **配置**: `hive.config.json` 的 `plugins` 字段写入逻辑（新增 install/remove 时自动更新）
- **依赖**: 新增 `commander` npm 依赖
- **现有代码**: `plugins.ts` 的 `scanPluginDir()` 可能需要小幅调整以兼容 npm `--prefix` 安装后的目录结构
- **Desktop**: 本期不做 UI，但预留 Server API 接口（后续 Desktop 集成用）
