## Why

当前 `@bundy-lmw/hive-core` 包存在严重的代码冗余和架构设计问题：`AgentRunner` 和 `Task` 两套执行引擎重复实现相同的 SDK 调用逻辑（约 70% 重复）；`AgentCapability` 接口契约不一致（部分能力添加了未在接口中定义的 `initializeAsync()`）；`AgentContextImpl` 同时承担 5 种角色（DI 容器、Service Locator、工厂、生命周期管理器、能力注册表），违反单一职责原则；`ChatCapability` 绕过 `AgentRunner` 直接调用 SDK 导致超时和控制逻辑重复；类型定义分散在两个文件边界模糊；`ProviderManager` 单例与实例模式混用存在状态不一致风险。这些问题增加了维护成本，降低了代码可测试性，且在持续迭代中会加速恶化。

## What Changes

- **合并 Runner 和 Task 为统一执行引擎**：删除 `Task` 类，将其并行执行能力吸收进 `AgentRunner`，消除 ~200 行重复代码
- **统一能力初始化契约**：`AgentCapability` 接口增加 `initializeAsync?()` 方法，所有异步初始化统一通过 `AgentContextImpl.initializeAll()` 管理，移除手动调用
- **拆分 AgentContextImpl 职责**：提取 `AgentFactory`（创建依赖）和 `CapabilityRegistry`（管理能力注册/查找），`AgentContextImpl` 仅保留 DI 容器和生命周期管理
- **ChatCapability 委托给 Runner**：移除 `ChatCapability` 中直接调用 `query()` 的逻辑，统一通过 `AgentRunner` 执行
- **合并类型文件**：将 `agents/types.ts` 和 `agents/core/types.ts` 合并为 `agents/types.ts`，消除类型边界模糊
- **清理 ProviderManager 单例模式**：移除全局单例导出，统一使用实例模式，由 `AgentFactory` 管理
- **删除废弃代码**：移除 `@deprecated` 的 `ProvidersConfig`、`applyToEnv()`、以及 `runner.ts` 中每次创建新实例的便捷函数

## Capabilities

### New Capabilities

- `unified-execution-engine`: 统一的 Agent 执行引擎，合并 Runner 和 Task 的功能，提供子 Agent 执行、并行执行、超时控制
- `capability-lifecycle`: 能力模块生命周期契约，定义统一的初始化/销毁接口，支持同步和异步初始化
- `agent-context-factory`: Agent 上下文工厂，负责创建和组装 AgentContext 的所有依赖

### Modified Capabilities

- `plugin-interface`: 能力模块接口变更（新增 `initializeAsync`），影响所有实现 `AgentCapability` 的插件

## Impact

- **内部 API 变更**：`AgentCapability` 接口新增可选方法，`Task` 类被删除，`AgentRunner` API 扩展
- **类型导出路径**：`agents/core/types.ts` 内容合并到 `agents/types.ts`，外部导入路径可能需要调整
- **ProviderManager**：移除全局单例，所有使用处改为通过 `AgentContext` 获取
- **测试**：涉及 `runner.test.ts`、`task` 相关测试需要合并更新，能力模块测试需要适配新接口
- **依赖关系**：`ChatCapability`、`WorkflowCapability`、`SubAgentCapability` 的实现需要适配统一执行引擎
