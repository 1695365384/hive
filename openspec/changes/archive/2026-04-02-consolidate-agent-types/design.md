## Context

当前 agents.ts 定义了 4 种 Agent 类型，但实际只有 2 种独立的职责：

| 类型 | 工具集 | 有 Prompt 模板 | 有 subagent-tool | 实际被调用 |
|------|--------|---------------|-----------------|-----------|
| explore | 只读 6 个 | explore.md | 有 | 是 |
| plan | 只读 6 个（= explore） | plan.md | 有 | 是（但和 explore 难区分） |
| evaluator | 全量 9 个（= general） | 无 | 无 | 仅 runner 便捷方法 |
| general | 全量 9 个 | intelligent.md（间接） | 无（主 Agent 本身） | 是 |

## Goals / Non-Goals

**Goals:**
- 将 4 种 Agent 类型精简为 2 种：explore（只读）+ general（全量）
- 消除 evaluator/general 和 explore/plan 的重复定义
- 保持向后兼容：`runner.execute('evaluator', ...)` 和 `runner.execute('plan', ...)` 仍可用
- 合并 explore + plan prompt 的优点到单一 explore.md

**Non-Goals:**
- 不改变工具集内容
- 不改变 subagent-tools 的结构
- 不改变 ExecutionCapability 的核心执行逻辑
- 不改变 CLI 参数格式

## Decisions

### D1: evaluator → general 别名

**选择**: 删除 evaluator 作为独立 Agent 定义，`getAgentConfig('evaluator')` 返回 general 的配置。

**备选方案**:
- A) 完全删除 evaluator，调用时报错 → 破坏向后兼容
- B) evaluator 独立存在但指向同一配置 → 增加维护负担

**理由**: 方案 B 最小改动，runner.execute('evaluator', ...) 和 runner.evaluator() 仍可正常工作，但底层统一到 general。

### D2: plan → explore 别名

**选择**: 删除 plan 作为独立 Agent 定义，`getAgentConfig('plan')` 返回 explore 的配置。

**备选方案**:
- A) 保留 plan 作为独立类型但 prompt 复用 explore → 仍然有 3 种类型
- B) 完全删除 plan → 破坏 subagent-tool 中的 plan 工具

**理由**: plan 子 Agent 工具仍然需要存在（LLM 用它做深度研究），但底层执行统一到 explore。plan subagent-tool 的 `agentName` 改为 'explore'，description 保留差异化文案。

### D3: explore prompt 合并策略

**选择**: 保留 explore.md 为基础，从 plan.md 中提取结构化输出格式（Relevant Files / Current Implementation / Dependencies / Recommendations）合并进来。通过 thoroughness 参数控制深度：
- quick → 快速搜索（原 explore 行为）
- medium → 均衡探索（默认）
- very-thorough → 深度研究 + 结构化输出（原 plan 行为）

### D4: ToolRegistry 白名单简化

**选择**: 删除 evaluator 和 plan 白名单条目。`getToolsForAgent('evaluator')` 和 `getToolsForAgent('plan')` 通过 fallback 逻辑分别映射到 general 和 explore。

### D5: ExecutionCapability forceMode 处理

**选择**: forceMode 'plan' 映射到 explore 逻辑，'evaluator' 映射到 general 逻辑（即正常模式）。不修改 ForceMode 类型定义，保持 'explore' | 'plan' | undefined 的接口。

### D6: AGENT_PRESETS 简化

**选择**: 只保留 explore（maxSteps: 10）和 general（maxSteps: 30）。删除 plan 和 evaluator 预设。'plan' 和 'evaluator' 通过 fallback 到对应类型获取预设。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| LLM 可能过度使用 explore 子 Agent（因为没有了 plan 的语义区分） | subagent-tool 的 description 保留差异化，引导 LLM 在深度研究时使用 |
| 测试依赖 evaluator/plan 类型的断言需要全部修复 | 逐文件修复，优先保证现有测试套件通过 |
| 外部代码可能直接 import AGENT_NAMES.EVALUATOR | 保留 AGENT_NAMES 中的 evaluator 字段，标记 @deprecated |
