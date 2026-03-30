## MODIFIED Requirements

### Requirement: 目录扫描兼容 npm --prefix 安装
`apps/server/src/plugins.ts` 的 `scanPluginDir()` SHALL 支持识别通过 `npm install --prefix` 安装到 `.hive/plugins/<name>/` 的插件目录。

#### Scenario: --prefix 安装的插件被发现
- **WHEN** `.hive/plugins/feishu/` 目录下没有直接的 `package.json`（含 `hive.plugin`），但存在 `node_modules/@bundy-lmw/hive-plugin-feishu/package.json`（含 `hive.plugin`）
- **THEN** 将其识别为合法插件，entry 指向 `node_modules/@bundy-lmw/hive-plugin-feishu/` 下的入口文件

#### Scenario: 直接目录安装仍被支持
- **WHEN** `.hive/plugins/feishu/` 目录下直接存在 `package.json`（含 `hive.plugin`）
- **THEN** 行为与修改前完全一致（优先级高于 node_modules 检测）
