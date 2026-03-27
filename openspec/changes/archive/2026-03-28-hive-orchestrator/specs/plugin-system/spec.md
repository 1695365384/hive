## ADDED Requirements

### Requirement: 插件加载
系统 SHALL 支持动态加载插件。

#### Scenario: 加载本地插件
- **WHEN** 调用 pluginHost.load("/path/to/plugin")
- **THEN** 插件被加载
- **AND** 插件的 init() 方法被调用

#### Scenario: 加载 npm 插件
- **WHEN** 调用 pluginHost.load("my-plugin")
- **THEN** 从 node_modules 加载插件

### Requirement: 插件生命周期
系统 SHALL 管理插件生命周期（加载、启用、禁用、卸载）。

#### Scenario: 启用插件
- **WHEN** 调用 pluginHost.enable("my-plugin")
- **THEN** 插件状态变为 enabled
- **AND** 插件开始接收事件

#### Scenario: 禁用插件
- **WHEN** 调用 pluginHost.disable("my-plugin")
- **THEN** 插件状态变为 disabled
- **AND** 插件不再接收事件

#### Scenario: 卸载插件
- **WHEN** 调用 pluginHost.unload("my-plugin")
- **THEN** 插件的 destroy() 方法被调用
- **AND** 插件从系统中移除

### Requirement: 插件钩子
系统 SHALL 支持插件注册钩子拦截消息。

#### Scenario: 消息拦截
- **WHEN** 插件注册 onMessage 钩子
- **AND** 消息经过总线
- **THEN** 钩子被调用，可修改或阻止消息

#### Scenario: Agent 生命周期钩子
- **WHEN** Agent 启动或结束
- **THEN** 注册了对应钩子的插件被通知

### Requirement: 插件依赖
系统 SHALL 支持声明和解析插件依赖。

#### Scenario: 依赖检查
- **WHEN** 加载插件 A，依赖插件 B
- **AND** 插件 B 未加载
- **THEN** 抛出错误 "Missing dependency: B"

#### Scenario: 依赖自动加载
- **WHEN** 加载插件 A，依赖插件 B
- **AND** 启用自动加载
- **THEN** 自动加载插件 B
