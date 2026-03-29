## Why

Hive 的三子 Agent 管道（explore → plan → general）使用**原始文本拼接**在阶段间传递上下文。explore 阶段输出可能被 LLM 的 maxOutputTokens 截断，plan 阶段拿到残缺的摘要，general 阶段三层累积更容易超长。Claude Code 的做法是：子 Agent 间通过**压缩摘要**传递上下文，每个子 Agent 是**独立对话实例**，prompt 针对当前任务**动态生成**。Hive 需要对齐这个架构。

## What Changes

- 引入 **Context Compaction** 机制：子 Agent 阶段切换时，将上一阶段的对话压缩为结构化摘要，而非直接拼接原始文本
- 引入 **动态 Prompt 构建**：每个子 Agent 的 system prompt 根据当前任务上下文动态生成，不再只是固定模板 + `{{task}}`
- 子 Agent 从**独立 LLM 调用**升级为**独立对话实例**（独立 messages 数组），支持多轮工具调用
- 子 Agent 输出改为**结构化结果**（JSON），包含关键文件列表、摘要、建议等，而非纯文本
- **BREAKING**: `WorkflowCapability` 的内部 API 变化（`runExplorePhase`/`runPlanPhase` 返回值从 string 变为结构化对象）

## Capabilities

### New Capabilities

- `context-compaction`: 对话历史压缩/摘要机制，在子 Agent 阶段切换时将上一阶段输出压缩为结构化摘要
- `dynamic-prompt-builder`: 根据任务上下文、阶段角色、前置阶段结果动态构建子 Agent 的 system prompt

### Modified Capabilities

（无已有 spec 需要修改）

## Impact

- **核心文件**: `WorkflowCapability.ts`（管道编排重构）、`SubAgentCapability.ts`（子 Agent 执行升级）、`AgentRunner.ts`（独立对话实例支持）
- **新增文件**: `ContextCompactor`（压缩引擎）、`DynamicPromptBuilder`（动态 prompt 构建）
- **模板文件**: `explore.md`、`plan.md`、`intelligent.md` 可能需要调整变量占位符
- **测试**: 所有 workflow 相关测试需要更新
- **API**: `WorkflowResult` 的返回结构可能变化，影响上层调用方
