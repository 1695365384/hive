## ADDED Requirements

### Requirement: 扫描插件目录
系统 SHALL 扫描 `.hive/plugins/` 下的所有子目录，读取每个子目录的 `package.json`，当 `hive.plugin === true` 时视为合法插件。

#### Scenario: 发现合法插件
- **WHEN** `.hive/plugins/plugin-feishu/package.json` 包含 `{ "hive": { "plugin": true, "entry": "dist/index.js" } }`
- **THEN** 识别为合法插件，返回其目录路径、入口文件路径、元信息

#### Scenario: 忽略非插件目录
- **WHEN** 子目录的 `package.json` 不存在或不包含 `"hive": { "plugin": true }`
- **THEN** 跳过该目录，不尝试加载

#### Scenario: 插件目录不存在
- **WHEN** `.hive/plugins/` 目录不存在
- **THEN** 返回空数组，不报错

#### Scenario: entry 字段缺失
- **WHEN** `package.json` 中有 `"hive": { "plugin": true }` 但没有 `entry` 字段
- **THEN** 使用默认入口 `dist/index.js`

### Requirement: 读取插件配置
系统 SHALL 从插件的 `config.json` 读取配置，传给插件构造函数。`config.json` 不存在时传空对象 `{}`。

#### Scenario: 配置文件存在
- **WHEN** 插件目录下存在 `config.json` 且包含 `{ "apps": [...] }`
- **THEN** 将该配置传给 `new Plugin(config)`

#### Scenario: 配置文件不存在
- **WHEN** 插件目录下不存在 `config.json`
- **THEN** 传 `{}` 给 `new Plugin({})`
