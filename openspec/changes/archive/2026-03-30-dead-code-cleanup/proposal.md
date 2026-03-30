## Why

经过多轮重构（统一工具系统、DAG 移除、pipeline 合成、smart routing、server bootstrap 简化等），代码库积累了大量死代码：

- **从未被调用的公共 API**：`validateAgentConfig()`、`validateProviderConfig()`、`validateOrThrow()`、`mergeSources()`、`getStaticModels()` 等
- **从未在生产代码中使用的函数**：`preprocessParams()` 仅在测试中被调用，LLM 运行时从未实际使用它来预处理参数
- **ProviderManager 上的死方法**：`getModels()`、`getModelSpec()`、`getContextWindow()`、`checkSupport()`、`estimateCost()`、`getSourceStatus()`、`getProviderType()`、`getMcpServers()`、`reload()` — 全部无外部调用方
- **兼容性 shim**：`getActiveProvider()`、`getAllProviders()`、`switchProvider()`、`getMcpServersForAgent()` 只是 `.active`、`.all`、`.switch()`、`.getMcpServers()` 的别名
- **重复类型定义**：`ProviderType` 在 `adapters/base.ts` 和 `providers/types.ts` 各定义一次；`AgentDefaults` 在 `providers/types.ts` 同文件定义两次
- **向后兼容类型别名**：`CCProvider`、`CCMcpServer` 零引用
- **未使用的导出**：`SCHEMA_URIS`、`SCHEMA_PATHS`、`getAgentConfigSchema()`、`getProviderConfigSchema()` 仅被内部 validator 使用（而 validator 本身也是死代码）
- **整个 config/validator.ts + schemas/**：core 的 JSON Schema 验证系统与 `apps/server/src/config.ts` 自带的 ajv 验证完全独立，core 的验证从未被调用

这些死代码增加了维护负担，干扰新开发者理解架构，且可能导致错误的假设（例如看到 `preprocessParams()` 以为参数预处理已经在生效）。

## What Changes

### A. 移除死代码

**config 验证系统（整个删除）：**
- `packages/core/src/config/validator.ts` — validateAgentConfig、validateProviderConfig、validateOrThrow
- `packages/core/src/config/index.ts` — 重新导出上述函数
- `packages/core/src/schemas/` — agent-config.json、provider-config.json、index.ts（仅被 validator 内部使用）

**providers 死方法：**
- `ProviderManager` 移除：`getModels()`、`getModelSpec()`、`getContextWindow()`、`checkSupport()`、`estimateCost()`、`getSourceStatus()`、`getProviderType()`、`getMcpServers()`、`reload()`
- `ProviderManager` 兼容 shim：移除 `getActiveProvider()`、`getAllProviders()`、`switchProvider()`、`getMcpServersForAgent()`，将调用方改为使用 `.active`、`.all`、`.switch()`、`.getMcpServers()`
- `openai-compatible.ts` 移除 `preprocessParams()` 及其测试 `param-adapt.test.ts`

**providers 死导出：**
- `metadata/index.ts` 移除 `getStaticModels()`、`createModelsDevClient()`、`getModelsDevClient()` 的公共导出（内部使用保留）
- `sources/index.ts` 移除 `mergeSources()` 函数

**index.ts 死导出：**
- 移除 `CCProvider`、`CCMcpServer` 类型别名
- 移除 `validateAgentConfig`、`validateProviderConfig`、`validateOrThrow`、`ValidationResult` 导出
- 移除 `SCHEMA_URIS`、`SCHEMA_PATHS`、`getAgentConfigSchema`、`getProviderConfigSchema` 导出

### B. 合并重复类型

- `ProviderType`：保留 `providers/types.ts` 中的定义，`adapters/base.ts` 改为 import
- `AgentDefaults`：删除 `providers/types.ts:61` 的重复定义，保留 `:206` 的完整版本
- `noopLogger` / `ILogger`：保留 `types/logger.ts` 为唯一定义源，`plugins/types.ts` 改为 re-export

### C. 更新受影响的调用方

**ProviderCapability.ts**（使用兼容 shim 的主要调用方）：
- `getActiveProvider()` → `.active`
- `getAllProviders()` → `.all`
- `switchProvider()` → `.switch()`

**AgentContext.ts**：
- `getActiveProvider()` → `.active`

**测试文件**：
- `agent-provider.test.ts`：更新兼容 shim 调用
- `mocks/agent-context.mock.ts`：移除 mock 中的死方法
- 删除 `tests/unit/providers/param-adapt.test.ts`

### D. 依赖清理

- `packages/core/package.json`：移除 `ajv` 依赖（validator 删除后不再需要）

## Capabilities

无新增 capability。本变更是纯粹的代码清理。

### Modified Capabilities

- `env-fallback`：`noopLogger` 的 import 路径从 `plugins/types.js` 改为 `types/logger.js`（内部重构，行为不变）
- `external-config`：`ExternalConfig` 类型保留（被 ProviderManager 实际使用），移除未使用的 `validateOrThrow` 验证入口

## Impact

- **Breaking**: `validateAgentConfig()`、`validateProviderConfig()`、`validateOrThrow()` 从 `@bundy-lmw/hive-core` 导出中移除（无外部调用方）
- **Breaking**: `preprocessParams()` 从 `@bundy-lmw/hive-core` 导出中移除（仅测试使用）
- **Breaking**: `getActiveProvider()`、`getAllProviders()`、`switchProvider()`、`getMcpServersForAgent()` 从 ProviderManager 移除
- **Breaking**: `getModels()`、`getModelSpec()`、`getContextWindow()` 等 ProviderManager 方法移除（后续由 provider-layer-abstraction change 重新实现 ModelSpec 数据流）
- `packages/core` 不再依赖 `ajv`
- 所有变更限于 `packages/core/src/` 和测试文件，不影响 `apps/server` 或 `packages/plugins`
