# Tasks: dead-code-cleanup

## A. 移除死代码

- [x] A1. 删除 `packages/core/src/config/validator.ts`（validateAgentConfig、validateProviderConfig、validateOrThrow）
- [x] A2. 清理 `packages/core/src/config/index.ts`，移除对 validator 的 re-export
- [x] A3. 删除 `packages/core/src/schemas/` 目录（agent-config.json、provider-config.json、index.ts）
- [x] A4. 移除 `ProviderManager` 死方法：getModels、getModelSpec、getContextWindow、checkSupport、estimateCost、getSourceStatus、getProviderType、getMcpServers、reload
- [x] A5. 移除 `ProviderManager` 兼容 shim：getActiveProvider、getAllProviders、switchProvider、getMcpServersForAgent
- [x] A6. 移除 `openai-compatible.ts` 的 `preprocessParams()` 函数
- [x] A7. 删除 `packages/core/tests/unit/providers/param-adapt.test.ts`
- [x] A8. 移除 `metadata/index.ts` 中 `getStaticModels`、`createModelsDevClient`、`getModelsDevClient` 的公共导出
- [x] A9. 移除 `sources/index.ts` 中的 `mergeSources()` 函数
- [x] A10. 清理 `packages/core/src/index.ts`：移除 CCProvider、CCMcpServer、validateAgentConfig、validateProviderConfig、validateOrThrow、ValidationResult、SCHEMA_URIS、SCHEMA_PATHS、getAgentConfigSchema、getProviderConfigSchema、preprocessParams 导出
- [x] A11. 清理 `packages/core/src/providers/index.ts`：移除 preprocessParams、getStaticModels、createModelsDevClient、getModelsDevClient 导出

## B. 合并重复类型

- [x] B1. `ProviderType`：`adapters/base.ts` 改为从 `providers/types.js` import + re-export
- [x] B2. `AgentDefaults`：删除 `providers/types.ts:61` 的重复定义，保留 `:206` 的完整版本

## C. 更新受影响的调用方

- [x] C1. `ProviderCapability.ts`：getActiveProvider → .active，getAllProviders → .all，switchProvider → .switch
- [x] C2. `AgentContext.ts`：getActiveProvider → .active
- [x] C3. 更新测试文件中的兼容 shim 调用（agent-provider.test.ts、mocks/agent-context.mock.ts 及其他 8 个测试文件）

## D. 依赖清理

- [x] D1. `packages/core/package.json` 移除 ajv 依赖

## E. 验证

- [x] E1. 运行 build 确认编译通过
- [x] E2. 运行测试确认全部通过（49 passed, 908 tests, 0 failures）
