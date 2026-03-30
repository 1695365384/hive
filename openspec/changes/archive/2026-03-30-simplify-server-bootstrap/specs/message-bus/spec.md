## ADDED Requirements

### Requirement: MessageBus 迁移到 @bundy-lmw/hive-core
`MessageBus` SHALL 从 `@bundy-lmw/hive-orchestrator` 迁移到 `@bundy-lmw/hive-core/src/bus/`，功能完全不变。

#### Scenario: MessageBus 可从 @bundy-lmw/hive-core 导入
- **WHEN** 代码使用 `import { MessageBus } from '@bundy-lmw/hive-core'`
- **THEN** 编译通过，行为与原来 `from '@bundy-lmw/hive-orchestrator'` 完全一致

#### Scenario: 现有功能保持不变
- **WHEN** 使用 `bus.subscribe()`、`bus.publish()`、`bus.request()`、`bus.emit()`
- **THEN** 行为与迁移前完全一致
- **THEN** wildcard 匹配、middleware pipeline、request/response 模式均保持原样

### Requirement: @bundy-lmw/hive-orchestrator 包删除
`@bundy-lmw/hive-orchestrator` 包 SHALL 从项目中删除，不再作为独立 npm 包存在。

#### Scenario: 所有引用迁移到 @bundy-lmw/hive-core
- **WHEN** 检查所有源文件中的 `import ... from '@bundy-lmw/hive-orchestrator'`
- **THEN** 所有 import 路径 SHALL 已更改为 `from '@bundy-lmw/hive-core'` 或其他有效路径
- **THEN** 不存在任何对 `@bundy-lmw/hive-orchestrator` 的引用
