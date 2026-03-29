## MODIFIED Requirements

### Requirement: 插件包导出约定
插件包 MUST 在入口文件提供 `default export`，导出实现 `IPlugin` 接口的类。这是动态加载的入口约定。

#### Scenario: 插件包提供 default export
- **WHEN** 动态加载器 `import('@hive/plugin-feishu')` 加载插件模块
- **THEN** `mod.default` 为一个实现 `IPlugin` 的类，可被 `new Plugin(config)` 实例化

#### Scenario: 现有命名导出保持兼容
- **WHEN** 外部代码通过命名导入使用插件（如 `import { FeishuPlugin } from '@hive/plugin-feishu'`）
- **THEN** 命名导出仍然可用，不受 default export 影响
