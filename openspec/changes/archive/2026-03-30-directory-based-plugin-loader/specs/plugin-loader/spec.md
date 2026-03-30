## MODIFIED Requirements

### Requirement: 双来源插件加载
`loadPlugins()` SHALL 同时支持目录扫描和 npm 动态 import 两种加载来源。目录插件优先，npm 插件不覆盖同名的目录插件。

#### Scenario: 仅目录插件
- **WHEN** `.hive/plugins/` 下有插件，`hive.config.json` 的 `plugins` 为空
- **THEN** 返回目录扫描发现的所有插件

#### Scenario: 仅 npm 插件
- **WHEN** `.hive/plugins/` 不存在或为空，`hive.config.json` 的 `plugins` 有配置
- **THEN** 按 npm 动态 import 加载所有配置的插件

#### Scenario: 两种来源共存
- **WHEN** `.hive/plugins/` 和 `hive.config.json` 的 `plugins` 都有插件
- **THEN** 合并两路结果，同名时目录插件优先

#### Scenario: 单个插件加载失败
- **WHEN** 某个插件加载失败（import 错误、default 不是构造函数等）
- **THEN** log 错误并跳过该插件，继续加载其余插件
