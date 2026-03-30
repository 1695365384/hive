## 1. ProviderRegistration 类型定义

- [x] 1.1 在 `packages/core/src/providers/types.ts` 中新增 `ProviderRegistration` 接口
- [x] 1.2 在 `packages/core/src/providers/index.ts` 中导出新类型

## 2. 内置 Provider Registry

- [x] 2.1 在 `packages/core/src/providers/metadata/provider-registry.ts` 中新增 `BUILTIN_REGISTRATION` Map，包含 glm / glm-coding / glm-coding-intl / glm-anthropic / deepseek / qwen 的注册信息
- [x] 2.2 新增 `getRegistration(id: string): ProviderRegistration | undefined` 函数

## 3. ProviderManager 自动补全配置

- [x] 3.1 修改 `ProviderManager` 解析配置逻辑：当 `baseUrl` 缺失时，从 `getRegistration(id)` 获取并补全
- [x] 3.2 当 `type` 缺失时，优先从 `getRegistration(id).type` 获取，其次从 `PROVIDER_TYPE_MAP` 获取
- [x] 3.3 当 `apiKey` 缺失时，从 `getRegistration(id).envKeys` 读取环境变量 fallback
- [x] 3.4 若 `baseUrl` 缺失且 Registry 中无该 id，抛出明确错误信息

## 4. ModelSpec 数据流贯通

- [x] 4.1 `ProviderManager.getModel()` 返回值改为 `{ model: LanguageModelV3; spec: ModelSpec | null }`
- [x] 4.2 `LLMRuntime.run()` 内部适配新的 getModel 返回值，将 spec 附加到 RuntimeResult
- [x] 4.3 `RuntimeResult` 新增可选字段 `modelSpec?: { contextWindow: number; maxOutputTokens: number; supportsTools: boolean }`
- [x] 4.4 适配 `LLMRuntime` 中所有调用 `getModel()` 的位置（run、runStream、runWithTools）

## 5. CompressionService 动态 contextWindowSize

- [x] 5.1 `CompressionService` 构造函数 `contextWindowSize` 改为必填参数
- [x] 5.2 Agent 初始化时从 ProviderManager 获取当前模型的 contextWindow，传入 CompressionService

## 6. ProviderConfig 简化

- [x] 6.1 `ProviderConfig.baseUrl` 改为可选（`baseUrl?: string`）
- [x] 6.2 更新 `hive.config.example.json` 示例，移除 baseUrl 字段
- [x] 6.3 确保环境变量 fallback 优先级：用户显式配置 > 环境变量 > Registry envKeys

## 7. 测试

- [x] 7.1 为 `getRegistration()` 编写单元测试（已知 id 返回、未知 id 返回 undefined）
- [x] 7.2 为 ProviderManager 自动补全编写单元测试（baseUrl 补全、type 补全、apiKey 环境变量 fallback）
- [x] 7.3 为 `RuntimeResult.modelSpec` 编写单元测试（spec 存在/不存在）
- [x] 7.4 为 CompressionService 动态 contextWindowSize 编写单元测试
