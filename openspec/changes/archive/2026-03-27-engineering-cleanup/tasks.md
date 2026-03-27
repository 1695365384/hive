## 1. 类型合并

- [x] 1.1 将 `agents/core/types.ts` 中独有的类型（AgentCapability, AgentContext, AgentOptions, WorkflowOptions, WorkflowResult, TaskAnalysis, HeartbeatConfig, HeartbeatResult, HeartbeatTaskConfig, TimeoutError, TimeoutConfig, AgentInitOptions, AgentRegistry）合并到 `agents/types.ts`
- [x] 1.2 删除 `agents/core/types.ts`，在 `agents/core/index.ts` 中添加从 `agents/types.ts` 的重导出以保持向后兼容
- [x] 1.3 验证所有文件的导入路径编译通过（`npm run build`）

## 2. 能力生命周期统一

- [x] 2.1 在合并后的 `agents/types.ts` 中的 `AgentCapability` 接口增加 `initializeAsync?(context: AgentContext): Promise<void>` 可选方法
- [x] 2.2 修改 `SessionCapability`：将公共 `initializeAsync()` 的逻辑移入 `initializeAsync(context: AgentContext)` 接口方法，删除公共 `initializeAsync()` 方法
- [x] 2.3 修改 `ProviderCapability`：将公共 `initializeAsync()` 的逻辑移入 `initializeAsync(context: AgentContext)` 接口方法，删除公共 `initializeAsync()` 方法
- [x] 2.4 修改 `AgentContextImpl.initializeAll()`：在所有 `initialize()` 之后，遍历调用所有实现了 `initializeAsync` 的能力
- [x] 2.5 修改 `Agent.initialize()`：移除对 `sessionCap.initializeAsync()` 和 `providerCap.initializeAsync()` 的手动调用，统一由 `initializeAll()` 管理
- [x] 2.6 确保能力注册顺序正确（session 先于 provider 注册）
- [x] 2.7 运行测试验证初始化行为不变

## 3. CapabilityRegistry 提取

- [x] 3.1 创建 `agents/core/CapabilityRegistry.ts`：实现 `register()`, `get<T>()`, `getAll()`, `has()`, `clear()` 方法
- [x] 3.2 修改 `AgentContextImpl`：用 `CapabilityRegistry` 替换内部的 `Map<string, AgentCapability>`，`registerCapability()` 和 `getCapability()` 委托给 registry
- [x] 3.3 在 `AgentContext` 接口上添加类型安全的便捷访问方法（如 `getSessionCap()`, `getProviderCap()` 等），替代字符串查找的 `getCapability('name')`
- [x] 3.4 修改 `WorkflowCapability.getSessionCap()`：改用类型安全的便捷方法，移除 try/catch + 字符串查找
- [x] 3.5 修改 `ProviderCapability.configurePersistenceIfNeeded()`：移除 `as unknown as` 强转，改用类型安全访问
- [x] 3.6 运行测试验证

## 4. 执行引擎合并

- [x] 4.1 在 `AgentRunner` 中新增 `executeChat(prompt, options)` 方法：从 `ChatCapability.processStream()` 提取 SDK query 调用 + 消息流处理 + 超时控制逻辑
- [x] 4.2 在 `AgentRunner` 中新增 `runParallel(tasks, maxConcurrent)` 方法：从 `task.ts` 的 `runParallel()` 迁移并行执行逻辑
- [x] 4.3 在 `AgentRunner` 中新增 `runTask(prompt, options)` 方法：从 `task.ts` 的 `Task.run()` 迁移单任务执行逻辑
- [x] 4.4 在 `AgentRunner` 中新增 `runExploreTask(prompt, thoroughness)` 和 `runPlanTask(prompt)` 便捷方法
- [x] 4.5 修改 `ChatCapability`：`send()` 方法委托给 `runner.executeChat()`，删除 `processStream()` 中的重复逻辑
- [x] 4.6 删除 `agents/core/task.ts` 文件
- [x] 4.7 从 `agents/core/index.ts` 移除 task.ts 的导出
- [x] 4.8 运行测试验证执行行为不变

## 5. 清理废弃代码

- [x] 5.1 删除 `providers/types.ts` 中 `@deprecated` 的 `ProvidersConfig` 接口
- [x] 5.2 删除 `ProviderManager.applyToEnv()` 方法及其 `@deprecated` 标注
- [x] 5.3 删除 `ProviderManager` 的全局单例：移除 `_instance`、`getProviderManager()`、`providerManager` 导出、`resetProviderManager()`
- [x] 5.4 删除 `runner.ts` 中每次创建新实例的便捷函数（`runAgent()`, `runExplore()`, `runPlan()`, `runGeneral()`）— 这些函数创建无 ProviderManager 的 Runner，功能不完整
- [x] 5.5 运行 `npm run build` 确认编译通过
- [x] 5.6 运行 `npm test` 确认所有测试通过
