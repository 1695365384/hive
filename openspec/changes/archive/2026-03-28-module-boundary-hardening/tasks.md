## 1. 提取 ILogger 到独立类型模块

- [x] 1.1 创建 `packages/core/src/types/logger.ts`，从 `plugins/types.ts` 移入 ILogger 接口和 noopLogger 实现
- [ ] 1.2 更新 `plugins/types.ts`：删除 ILogger/noopLogger 原始定义，改为从 `../types/logger.js` 重新导出
- [x] 1.3 更新 `packages/core/src/index.ts`：添加 ILogger/noopLogger 的导出（如果尚未导出）
- [x] 1.4 验证 build 通过（`pnpm -r build`）和测试通过（`pnpm -r test`）

## 2. 消除 providers → workspace 依赖

- [x] 2.1 在 `providers/metadata/types.ts` 中定义或确认 `ModelsDevCache`/`CachedProviderInfo`/`CachedModelInfo` 类型已存在（如不存在则从 workspace/types.ts 复制定义）
- [x] 2.2 更新 `providers/metadata/models-dev.ts`：移除 `from '../../workspace/types.js'` 导入，改用本地类型
- [ ] 2.3 更新 `providers/metadata/workspace-persistence.ts`：移除 `from '../../workspace/index.js'` 导入，将 WorkspaceManager 替换为接口注入（通过构造参数接收持久化路径）
- [x] 2.4 验证 build 通过和测试通过

## 3. 拆分 Agent.ts

- [x] 3.1 创建 `packages/core/src/agents/core/state.ts`，提取 AgentState 类型和状态管理辅助函数
- [x] 3.2 精简 `Agent.ts`：移除已提取的类型和函数，更新 import
- [x] 3.3 验证 Agent.ts 不超过 400 行
- [x] 3.4 验证 build 通过和测试通过

## 4. 最终验证

- [x] 4.1 运行完整 build（`pnpm -r build`）
- [x] 4.2 运行完整测试套件（`pnpm -r test`）
- [x] 4.3 确认无循环依赖（`madge --circular packages/core/src`）
