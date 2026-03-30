## ADDED Requirements

### Requirement: npm Registry 搜索
系统 SHALL 通过 npm Registry Search API (`https://registry.npmjs.org/-/v1/search`) 搜索 `@hive/plugin-*` scope 下的插件包，支持关键词匹配。

#### Scenario: 搜索到匹配插件
- **WHEN** 用户执行 `hive plugin search feishu`
- **THEN** 调用 npm Search API，参数 `text=feishu+scope:hive-plugin`，返回匹配的插件列表，每个条目展示名称、版本、描述、周下载量

#### Scenario: 无匹配结果
- **WHEN** 搜索关键词在 `@hive/plugin-*` scope 下无匹配
- **THEN** 展示"No plugins found"提示

#### Scenario: 搜索无关键词
- **WHEN** 用户执行 `hive plugin search`（不带参数）
- **THEN** 展示 `@hive/plugin-*` scope 下所有插件（按 relevance 排序，默认 20 条）

#### Scenario: 网络错误
- **WHEN** npm Registry API 请求失败（网络不通、超时等）
- **THEN** 展示错误信息并提示检查网络连接

### Requirement: 搜索结果格式化
搜索结果 SHALL 格式化为表格形式展示，包含插件名称、版本、描述、安装命令。

#### Scenario: 格式化输出
- **WHEN** 搜索返回 N 个插件
- **THEN** 每个插件一行，格式为：`<name>  v<version>  <description>`，末尾追加 `Install: hive plugin add <name>`

### Requirement: 搜索结果限制
搜索结果 SHALL 限制返回数量，默认最多 20 条。

#### Scenario: 超过限制
- **WHEN** 搜索匹配超过 20 个插件
- **THEN** 只展示前 20 条，并提示总数
