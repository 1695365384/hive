## Context

Hive core 包 (`packages/core/src`) 有 26 个子目录，模块依赖方向整体健康（无循环依赖）。但审计发现 4 个违反软件工程原则的问题：

1. `ILogger` 定义在 `plugins/types.ts` 中，被 agents/hooks/providers/skills 四个模块依赖 → 人为扩大 plugins 影响范围
2. `providers/metadata/workspace-persistence.ts` 直接 import `workspace/index.js` → 基础设施层依赖应用层（违反 DIP）
3. `providers/metadata/models-dev.ts` 直接 import `workspace/types.js` → 同上
4. `Agent.ts` 637 行，包含构建逻辑 + 运行时逻辑

## Goals / Non-Goals

**Goals:**
- 将 ILogger 提取到独立模块，消除 agents/hooks/providers/skills 对 plugins 的伪依赖
- 通过接口注入消除 providers → workspace 的直接依赖
- 拆分 Agent.ts 使其不超过 400 行
- 所有现有测试保持通过，所有公共 API 保持向后兼容

**Non-Goals:**
- 不重组 hooks/implementations 的目录结构（按机制分组是有意的设计选择）
- 不改变任何运行时行为（纯重构）
- 不引入新的外部依赖

## Decisions

### Decision 1: ILogger 提取到 `types/logger.ts`

**选择**：创建 `packages/core/src/types/logger.ts`，定义 ILogger 接口和 noopLogger

**替代方案**：
- A) 放在 `types/index.ts` → types 目录会有多个 barrel 文件，命名冲突风险
- B) 放在 `utils/logger.ts` → utils 通常是纯函数，ILogger 是接口定义
- C) 当前方案：独立文件 `types/logger.ts` → 清晰、最小化、易于导入

**迁移策略**：
- `plugins/types.ts` 保留 ILogger 和 noopLogger 的 `export { ... } from '../types/logger.js'` 重新导出
- 所有现有 `from '../plugins/types.js'` 的导入**不需要立即修改**（向后兼容）
- 后续新代码统一从 `../types/logger.js` 导入

### Decision 2: 通过 IPersistence 接口解耦 providers → workspace

**选择**：定义 `IPersistence` 接口放在 `providers/metadata/types.ts`，workspace-persistence.ts 保留在 providers 内但只依赖接口

**替代方案**：
- A) 移动 workspace-persistence.ts 到 workspace 模块 → providers 仍然需要 import workspace 的实现
- B) 当前方案：将持久化路径作为构造参数注入 → providers 完全不知道 workspace 的存在

**具体做法**：
- `providers/metadata/models-dev.ts` 中的 `ModelsDevPersistence` 接口已经是抽象的
- `workspace-persistence.ts` 实现该接口，但不需要 import workspace 模块
- 只需将 `ModelsDevCache` 等类型从 `workspace/types.ts` 复制或移到 providers 内部
- `models-dev.ts` 不再 import workspace/types.js

### Decision 3: Agent.ts 拆分策略

**选择**：提取 `AgentState` 类型和辅助函数到 `agents/core/state.ts`

**替代方案**：
- A) 拆分为 AgentBuilder + AgentRunner → 过度设计，Agent 不是 builder 模式
- B) 当前方案：提取类型和辅助函数 → 最小化改动，降低 Agent.ts 到 ~400 行

## Risks / Trade-offs

- **[ILogger 重新导出链条]** → plugins/types.ts 的重新导出是临时的，后续可以逐步迁移。保留 2 个导入路径在 TypeScript 中零成本
- **[类型复制]** → ModelsDevCache 等类型可能需要在 providers 内重新定义 → 与 workspace/types.ts 的类型需要保持同步 → 风险低：这些类型很少变更
- **[Agent.ts 拆分边界]** → 拆分后文件间的隐式耦合 → 通过明确的 export/import 约束降低风险
