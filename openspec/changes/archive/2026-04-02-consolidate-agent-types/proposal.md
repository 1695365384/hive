## Why

当前子 Agent 系统定义了 4 种类型（explore / plan / evaluator / general），但实际存在严重的职责重叠和身份模糊：

- **evaluator 与 general**：工具集完全一样（9 个全量工具），evaluator 没有 prompt 模板，没有被任何 subagent-tool 暴露，在业务流中从未被独立调用
- **explore 与 plan**：都是只读模式，工具集完全一样（6 个只读工具），prompt 内容高度相似，LLM 难以区分何时用哪个

这导致维护成本高、新人理解困难、代码中充斥着死路径。

## What Changes

- 合并 evaluator + general → **general**（保留 evaluator 作为向后兼容别名）
- 合并 explore + plan → **explore**（保留 plan 作为向后兼容别名）
- 删除 plan.md 模板，将 plan 的结构化输出优点合并到 explore.md
- 删除 ToolRegistry 中重复的 evaluator 白名单
- 清理 runner.ts 中冗余的便捷方法
- 统一 AGENT_PRESETS、CORE_AGENTS、AGENT_NAMES 为两种类型

## Capabilities

### New Capabilities

（无新增能力）

### Modified Capabilities

- `builtin-tools`: Agent 类型从 4 种精简为 2 种（explore / general），ToolRegistry 白名单调整
- `task-dispatch`: runner.ts Agent 执行路径简化，evaluator/plan 降级为别名
- `unified-execution-engine`: ExecutionCapability forceMode 简化

## Non-goals

- 不改变工具集本身（只读工具和全量工具的划分保持不变）
- 不改变 subagent-tools 的行为（explore 子 Agent 工具仍然存在）
- 不改变 ExecutionCapability 的核心执行逻辑
- 不改变 prompt 模板的内容风格

## Impact

- **core**：agents.ts、runner.ts、tool-registry.ts、LLMRuntime.ts、ExecutionCapability.ts、prompts.ts
- **templates**：删除 plan.md，重写 explore.md
- **测试**：runner.test.ts、builtin.test.ts、index.test.ts 等依赖 agent 类型的测试需修复
- **API**：`runner.execute('evaluator', ...)` 和 `runner.execute('plan', ...)` 仍可用（向后兼容）
