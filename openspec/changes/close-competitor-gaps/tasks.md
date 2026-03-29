## 1. 模型定价表

- [x] 1.1 在 `providers/metadata/` 新增 `pricing.ts`，定义 `ModelPricing` 接口和核心模型单价表（input$/1K tokens, output$/1K tokens），覆盖 claude-haiku-4-5、claude-sonnet-4-6、deepseek-chat、glm-4-flash、moonshot-v1-8k
- [x] 1.2 导出 `getModelPricing(modelId): ModelPricing | null` 函数，未知模型返回 null
- [x] 1.3 为定价表编写单元测试（已知模型返回价格、未知模型返回 null）

## 2. 成本追踪集成

- [x] 2.1 在 `dispatch/types.ts` 的 DispatchResult 中新增 `cost?: { input: number; output: number; total: number }` 字段
- [x] 2.2 在 Dispatcher 中：chat 路径收集 SDK usage 并计算成本，写入 DispatchResult.cost
- [x] 2.3 在 Dispatcher 中：workflow 路径聚合 explore/plan/execute 三阶段的 usage 并计算总成本
- [x] 2.4 更新 dispatcher.test.ts 验证 cost 字段在 chat 和 workflow 两种路径下正确填充
- [x] 2.5 当 SDK 未返回 usage 时，cost 字段保持 undefined（不为零）

## 3. 权限硬限制

- [x] 3.1 修改 `runner.ts` 的 `execute()` 方法签名，新增可选 `tools?: string[]` 参数
- [x] 3.2 当 `tools` 参数传入时，只将白名单中的工具传给 SDK 的 `options.tools`
- [x] 3.3 修改 SubAgentCapability：explore() 调用 runner.execute() 时传入 `tools: CORE_AGENTS.explore.tools`
- [x] 3.4 修改 SubAgentCapability：plan() 调用 runner.execute() 时传入 `tools: CORE_AGENTS.plan.tools`
- [x] 3.5 修改 SubAgentCapability：general() 不传 tools 限制（保持全工具）
- [x] 3.6 当调用方通过 options.tools 显式传入工具列表时，调用方传入的列表优先
- [x] 3.7 更新 SubAgentCapability 单元测试，验证 explore/plan 只能调用只读工具

## 4. Trace 持久化

- [x] 4.1 在 SessionManager 中新增 `saveTrace(sessionId: string, trace: DispatchTraceEvent[]): Promise<void>` 方法
- [x] 4.2 在 SessionManager 中新增 `getTraces(sessionId: string): DispatchTraceEvent[][]` 查询方法
- [x] 4.3 在 Dispatcher.dispatch() 的 finally 块中调用 sessionManager.saveTrace() 持久化 trace
- [x] 4.4 在 dispatch.complete trace 事件中新增 `duration` 字段（总耗时 ms）
- [x] 4.5 更新 SessionManager 单元测试，验证 trace 写入和读取
- [x] 4.6 更新 dispatcher.test.ts 验证 dispatch 后 trace 可通过 SessionManager 查询

## 5. ERNIE 提供商预设

- [x] 5.1 在 `providers/sources/env.ts` 的 BUILTIN_PRESETS 数组中新增 ERNIE 条目（id: 'ernie', envKey: 'ERNIE_API_KEY', baseUrl, defaultModel: 'ernie-4.0-8k'）
- [x] 5.2 在 `providers/metadata/provider-registry.ts` 中新增 ERNIE 元数据条目
- [x] 5.3 在 `providers/adapters/index.ts` 的 PROVIDER_ADAPTER_MAP 中新增 ernie → 'openai-compatible'
- [x] 5.4 更新 env source 单元测试，验证 ERNIE_API_KEY 检测

## 6. 国产模型参数适配

- [x] 6.1 在 `providers/adapters/openai-compatible.ts` 中新增 `preprocessParams(providerId, params)` 函数
- [x] 6.2 为 GLM 添加参数预处理：移除 `reasoning_effort`、`temperature`（如超出范围）
- [x] 6.3 为 Kimi 添加参数预处理：确保 `stream` 格式兼容 Moonshot API
- [x] 6.4 在请求发出前调用 preprocessParams，未知 provider 直接透传
- [x] 6.5 编写参数适配单元测试（GLM 剥离 reasoning_effort、Kimi stream 格式、未知 provider 透传）

## 7. Workflow 自动压缩

- [x] 7.1 在 WorkflowCapability.runComplexTask() 中，explore 完成后、构建 plan prompt 前，获取 sessionCap 并调用 compressIfNeeded()
- [x] 7.2 在 plan 完成后、构建 execute prompt 前，再次调用 compressIfNeeded()
- [x] 7.3 当 sessionCap 不可用时（如未启用 SessionCapability），跳过压缩不报错
- [x] 7.4 更新 WorkflowCapability 单元测试，验证压缩在阶段间被调用（mock CompressionService）
