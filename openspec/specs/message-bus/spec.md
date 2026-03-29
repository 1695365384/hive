## ADDED Requirements

### Requirement: MessageBus 迁移到 @hive/core
`MessageBus` SHALL 从 `@hive/orchestrator` 迁移到 `@hive/core/src/bus/`，功能完全不变。

#### Scenario: MessageBus 可从 @hive/core 导入
- **WHEN** 代码使用 `import { MessageBus } from '@hive/core'`
- **THEN** 编译通过，行为与原来 `from '@hive/orchestrator'` 完全一致

#### Scenario: 现有功能保持不变
- **WHEN** 使用 `bus.subscribe()`、`bus.publish()`、`bus.request()`、`bus.emit()`
- **THEN** 行为与迁移前完全一致
- **THEN** wildcard 匹配、middleware pipeline、request/response 模式均保持原样

### Requirement: @hive/orchestrator 包删除
`@hive/orchestrator` 包 SHALL 从项目中删除，不再作为独立 npm 包存在。

#### Scenario: 所有引用迁移到 @hive/core
- **WHEN** 检查所有源文件中的 `import ... from '@hive/orchestrator'`
- **THEN** 所有 import 路径 SHALL 已更改为 `from '@hive/core'` 或其他有效路径
- **THEN** 不存在任何对 `@hive/orchestrator` 的引用
