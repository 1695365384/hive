## MODIFIED Requirements

### Requirement: 插件包 package.json 声明
插件包 MUST 在 `package.json` 中声明 `"hive": { "plugin": true }` 以标识为 Hive 插件。`entry` 字段指定入口文件相对路径，默认 `dist/index.js`。

#### Scenario: 完整声明
- **WHEN** `package.json` 包含 `{ "hive": { "plugin": true, "entry": "dist/index.js" } }`
- **THEN** 扫描器使用 `dist/index.js` 作为 `import()` 的入口

#### Scenario: 仅声明 plugin 标记
- **WHEN** `package.json` 包含 `{ "hive": { "plugin": true } }` 但没有 `entry`
- **THEN** 使用默认入口 `dist/index.js`

### Requirement: 插件自带配置文件
插件目录下 MAY 存在 `config.json` 作为该插件的配置。加载时读取并传给构造函数。

#### Scenario: 有配置文件
- **WHEN** 插件目录下存在 `config.json`
- **THEN** 读取其内容作为插件配置

#### Scenario: 无配置文件
- **WHEN** 插件目录下不存在 `config.json`
- **THEN** 使用 `{}` 作为插件配置
