## ADDED Requirements

### Requirement: 配置驱动的插件加载
`apps/server/src/plugins.ts` SHALL 读取 `hive.config.json` 中的 `pluginConfigs`，对每个条目通过 `await import(packageName)` 动态加载插件模块，取 `mod.default` 作为插件类，用对应配置实例化后返回 `IPlugin[]`。

#### Scenario: 加载单个插件
- **WHEN** `pluginConfigs` 包含 `{ "@bundy-lmw/hive-plugin-feishu": { apps: [...] } }`
- **THEN** 执行 `import('@bundy-lmw/hive-plugin-feishu')`，取 `mod.default`，执行 `new Plugin({ apps: [...] })`，返回包含该插件实例的数组

#### Scenario: 加载多个插件
- **WHEN** `pluginConfigs` 包含多个插件配置
- **THEN** 按配置顺序依次加载所有插件，返回 `IPlugin[]`

#### Scenario: 无插件配置
- **WHEN** `pluginConfigs` 为空对象或未定义
- **THEN** 返回空数组 `[]`，server 正常启动

### Requirement: 插件加载失败不阻塞启动
单个插件加载失败时 SHALL 记录错误日志并跳过该插件，不影响其他插件和 server 启动。

#### Scenario: 插件包不存在
- **WHEN** `pluginConfigs` 中配置了一个未安装的包名
- **THEN** 打印包含包名的错误日志，跳过该插件，继续加载其余插件

#### Scenario: 插件包无 default export
- **WHEN** 插件模块的 `default` 不是构造函数
- **THEN** 打印错误日志，跳过该插件

### Requirement: 加载函数为 async
插件加载逻辑 SHALL 导出为 async 函数 `loadPlugins()`，因为涉及 `await import()`。

#### Scenario: bootstrap 调用
- **WHEN** `bootstrap.ts` 启动 server
- **THEN** 调用 `await loadPlugins()` 获取 `IPlugin[]`，传递给 `createServer()`

### Requirement: 目录扫描兼容 npm --prefix 安装
`apps/server/src/plugins.ts` 的 `scanPluginDir()` SHALL 支持识别通过 `npm install --prefix` 安装到 `.hive/plugins/<name>/` 的插件目录。

#### Scenario: --prefix 安装的插件被发现
- **WHEN** `.hive/plugins/feishu/` 目录下没有直接的 `package.json`（含 `hive.plugin`），但存在 `node_modules/@bundy-lmw/hive-plugin-feishu/package.json`（含 `hive.plugin`）
- **THEN** 将其识别为合法插件，entry 指向 `node_modules/@bundy-lmw/hive-plugin-feishu/` 下的入口文件

#### Scenario: 直接目录安装仍被支持
- **WHEN** `.hive/plugins/feishu/` 目录下直接存在 `package.json`（含 `hive.plugin`）
- **THEN** 行为与修改前完全一致（优先级高于 node_modules 检测）
