## Context

Hive 是一个多 Agent 协作框架，核心包 `@bundy-lmw/hive-core` 采用能力委托模式（Agent → AgentContext → Capabilities）。当前代码经过快速迭代后积累了技术债务：两套执行引擎（Runner + Task）、不一致的能力初始化契约、AgentContext 职责过重、类型定义分散等问题。本次重构不改变外部 API 行为，仅清理内部架构。

## Goals / Non-Goals

### Goals
- 消除 Runner 和 Task 之间的代码重复，统一为一套执行引擎
- 建立一致的能力模块初始化契约
- 拆分 AgentContextImpl 职责，提高可测试性
- 清理废弃代码和类型定义

### Non-Goals
- 不改变外部 API（Agent 类的公共方法签名不变）
- 不新增功能特性
- 不修改 providers 层的配置链逻辑
- 不修改 plugins 层

## Decisions

### D1: 合并 Task 到 AgentRunner（而非删除 Runner）

**选择**：保留 `AgentRunner` 作为唯一执行引擎，将 `Task` 的并行执行能力迁移进来。

**替代方案**：
- A) 保留 Task，删除 Runner → Task 名义不够通用，且缺少 Runner 的 prompt 预处理
- B) 两者都保留，抽取公共基类 → 增加复杂度，两个入口仍然混淆

**理由**：Runner 名字更准确（执行 Agent），且已有 explore/plan/general 的便捷方法。Task 的核心价值是并行控制，作为 Runner 的新方法 `runParallel()` 即可。

### D2: AgentCapability 接口增加 `initializeAsync`

**选择**：在接口中增加可选方法 `initializeAsync?(context: AgentContext): Promise<void>`，`AgentContextImpl.initializeAll()` 统一调用。

**替代方案**：
- A) 所有初始化都用 Promise（`initialize` 返回 `Promise<void>`）→ 简单但破坏现有同步能力
- B) 用生命周期枚举区分阶段 → 过度设计

**理由**：最小破坏性。同步能力不受影响，异步能力实现 `initializeAsync` 即可。`initializeAll()` 先调用所有 `initialize()`，再调用所有 `initializeAsync()`。

### D3: AgentContextImpl 拆分策略

**选择**：提取两个辅助类：
- `CapabilityRegistry`：管理能力的注册、查找、遍历
- 不引入额外的 DI 框架，保持手写注入的简洁性

**不拆分**的部分：
- `AgentContext` 接口保持不变（它是 capabilities 的依赖视图）
- 依赖创建逻辑保留在 `AgentContextImpl` 构造函数中（只有一处创建，无需独立工厂）

**理由**：当前的"五合一"问题主要来自 CapabilityRegistry 的职责混入。提取后 AgentContextImpl 只剩 DI 容器 + 生命周期管理，职责清晰。独立工厂类在当前只有一个创建点的情况下是过度抽象。

### D4: ChatCapability 统一通过 Runner 执行

**选择**：在 `AgentRunner` 上新增 `executeChat()` 方法，封装 SDK `query()` 调用 + 消息处理 + 超时控制。`ChatCapability.send()` 委托给 `runner.executeChat()`。

**理由**：`ChatCapability` 直接调用 `query()` 的约 150 行代码与 `Runner.executeQuery()` 高度重复。统一后超时控制、provider 配置、消息处理只有一份实现。

### D5: 类型文件合并

**选择**：将 `agents/core/types.ts` 的内容合并到 `agents/types.ts`，删除 `agents/core/types.ts`。`agents/core/types.ts` 的原有导出改为从 `agents/types.ts` 重导出以保持向后兼容。

**理由**：两个文件的内容都属于 Agent 系统的类型定义，没有按领域划分的逻辑边界。合并后查找类型只需看一个文件。

### D6: ProviderManager 移除全局单例

**选择**：删除 `getProviderManager()`、`providerManager` 全局导出和 `_instance` 单例变量。所有使用处通过 `AgentContext.providerManager` 获取。

**迁移**：`AgentContextImpl` 构造函数中 `new ProviderManager()` 已是实例模式，无需修改创建逻辑。

## Risks / Trade-offs

- [Runner 合并可能引入回归] → 保留现有测试用例，合并前先确保全部通过，合并后逐一验证
- [initializeAsync 顺序依赖] → `initializeAll()` 中 SessionCapability 的 `initializeAsync` 必须在 ProviderCapability 之前完成。通过 `AgentContextImpl` 中能力注册顺序保证（先注册 session，后注册 provider）
- [类型合并可能破坏外部导入] → 在 `agents/core/index.ts` 中添加重导出，确保 `from '../core/types.js'` 的导入路径仍然有效
- [ChatCapability 委托给 Runner 后流式处理行为变化] → `executeChat()` 需要支持与当前 `ChatCapability.processStream()` 相同的回调机制（onText, onTool, onThinking）

## Migration Plan

分 4 个阶段，每个阶段独立可验证：

1. **类型合并**（无行为变更）→ 合并类型文件，添加重导出，确保编译通过
2. **能力契约统一**（无行为变更）→ 增加 `initializeAsync` 接口，迁移 Session/Provider 能力，确保初始化顺序正确
3. **执行引擎合并**（核心变更）→ 合并 Task 到 Runner，ChatCapability 委托给 Runner
4. **清理**（删除代码）→ 移除废弃代码、全局单例、旧类型文件

每个阶段完成后运行全量测试验证。

## Open Questions

- `ChatCapability.processStream()` 中的流式处理逻辑（逐条消息处理、思考过程输出）是否需要原样保留到 `Runner.executeChat()` 中？→ 是的，行为必须不变
- `Task.runParallel()` 的并发控制（分批执行）在迁移到 Runner 后是否需要调整 API？→ 保持相同的并发控制策略，仅调整方法签名
