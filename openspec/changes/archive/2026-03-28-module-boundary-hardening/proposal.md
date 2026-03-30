## Why

模块架构审计发现 4 个违反软件工程原则的问题，这些问题会在后续迭代中导致重复重构：
1. `ILogger` 放在 `plugins/types.ts` 中，导致 agents/hooks/providers/skills 全部对 plugins 产生伪依赖
2. `providers → workspace` 依赖违反依赖倒置原则（基础设施层依赖应用层）
3. `hooks/implementations` 中的 WorkspacePersistence 位于 providers/metadata 中，混淆了模块边界
4. `agents/core` 整体尚可，但 Agent.ts (637 lines) 偏大，可预防性拆分

## What Changes

- 将 `ILogger` / `noopLogger` 从 `plugins/types.ts` 提取到独立的 `types/logger.ts` 模块
- 定义 `IPersistence` 接口替代 `providers → workspace` 的直接依赖，通过依赖注入解耦
- 将 `providers/metadata/workspace-persistence.ts` 移至 `workspace/providers-persistence.ts`，消除 providers 对 workspace 的反向依赖
- 拆分 `Agent.ts`：提取 `AgentState` 类型到独立文件，将 Agent 构建逻辑与运行时逻辑分离

## Capabilities

### New Capabilities
- `common-types`: 独立共享类型模块（ILogger, noopLogger），消除 plugins 作为伪共享类型的角色

### Modified Capabilities
- `plugin-interface`: 移除 ILogger/noopLogger 导出，改为从 common-types 重新导出以保持向后兼容

## Impact

- **受影响文件**：~15 个文件（ILogger 导入迁移）+ 3-4 个文件（workspace-persistence 移动）+ 2-3 个文件（Agent.ts 拆分）
- **API 兼容性**：ILogger 重新导出保证 `from '@bundy-lmw/hive-core'` 和 `from '../plugins/types.js'` 仍可工作
- **依赖方向**：providers 不再 import workspace，通过接口注入解耦
- **测试**：现有 640 个测试应全部通过，不需要新增测试（纯重构）
