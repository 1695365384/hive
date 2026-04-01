## Context

Hive Agent 使用 `DynamicPromptBuilder` 构建 system prompt，由多个 section 组成：base template → language → task → environment → history → context → skill。ScheduleCapability 已作为内部模块注册到 AgentContext，但 LLM 在对话中无法感知其存在。

当前定时任务触发链路：用户消息 → ScheduleCapability 关键词预过滤 → LLM 结构化输出 → 用户确认 → 创建任务。这条链路完全依赖关键词匹配，Agent 不会主动建议创建定时任务。

## Goals / Non-Goals

**Goals:**
- LLM 在对话中知道 Agent 具备定时任务能力（创建、查询、管理）
- LLM 能感知到当前已有的定时任务列表（上下文感知）
- 通过 prompt 注入实现，不引入新的 Tool 或修改 ScheduleCapability 内部逻辑

**Non-Goals:**
- 不注册 schedule-related Tool 函数（避免 ToolRegistry 污染）
- 不修改 ScheduleEngine 调度逻辑
- 不修改 ScheduleCapability 的 4 层防幻觉机制
- 不改变定时任务的持久化或生命周期管理

## Decisions

### Decision 1: 独立 prompt 模板文件

**选择**: 新增 `templates/schedule-awareness.md`，在 `DynamicPromptBuilder.buildSections()` 中作为独立 section 注入。

**替代方案**:
- A) 修改 `intelligent.md` 在 "Your Capabilities" 下追加 — 拒绝，因为 intelligent.md 是通用的 Agent 角色模板，不应该耦合业务能力
- B) 通过 SkillCapability 的 skill section 注入 — 拒绝，定时任务是核心能力而非可插拔技能

**理由**: 独立文件符合 templates/ 目录的职责划分（tool-guides.md 也是独立文件），且可以在 token budget 紧张时单独裁剪。

### Decision 2: 注入已有任务摘要

**选择**: 在构建 schedule section 时，查询 ScheduleRepository 获取已有任务列表，格式化为摘要嵌入 prompt。

**替代方案**:
- A) 不注入，让 Agent 通过自然语言触发 ScheduleCapability 的 listSchedules — 拒绝，这要求用户主动问，Agent 仍然是被动的
- B) 注入完整任务详情 — 拒绝，token 消耗过大

**理由**: 摘要让 Agent 具备"上下文感知"，能在对话中主动提及已有任务（如"你已有一个每天9点的日志检查任务，需要修改吗？"）。摘要限制为名称 + 调度模式 + 状态，控制 token 消耗。

### Decision 3: Section 优先级与 skill 相同

**选择**: schedule section 的 token budget 优先级设为 4（与 skill 相同），token 紧张时优先裁剪。

**理由**: 定时任务能力是辅助性功能，不影响核心的代码操作和对话能力。base/language/task/environment 优先级更高。

### Decision 4: 数据来源 — PromptBuildContext 扩展

**选择**: 在 `PromptBuildContext` 类型中新增可选字段 `scheduleSummary?: string`，由 ChatCapability/WorkflowCapability 在构建 prompt 前查询 ScheduleRepository 并填入。

**替代方案**:
- A) DynamicPromptBuilder 直接依赖 ScheduleRepository — 拒绝，Builder 是纯 prompt 组装层，不应持有数据依赖
- B) 通过 AgentContext 间接获取 — 可行但耦合度与方案 A 相同

**理由**: 保持 DynamicPromptBuilder 的纯粹性（只负责组装，不负责数据获取）。数据查询的职责放在 ChatCapability（它已经有 AgentContext 的访问权限）。

## Risks / Trade-offs

- **[Token 消耗增加]** → schedule section 每次对话都会注入，增加约 200-500 tokens。通过 budget 优先级 4 控制上限，token 紧张时自动裁剪。
- **[任务摘要延迟]** → 每次 chat 都查询 SQLite 获取任务列表。schedules 表通常不超过 50 条，查询延迟可忽略（<1ms）。
- **[Agent 过度建议]** → LLM 可能在不恰当的时机建议创建定时任务。通过 prompt 中明确的触发条件描述（"when the user expresses recurring needs"）降低误触发率。
