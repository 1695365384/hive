## Why

Agent 拥有 ScheduleCapability（创建/管理定时任务），但 LLM 在对话中完全不知道这个能力的存在。System prompt（intelligent.md）只声明了 Direct Tools 和 Sub-Agents，未提及定时任务。导致用户表达周期性需求时，Agent 无法主动建议创建定时任务，也无法查询/管理已有任务。

## What Changes

- 新增 `schedule-awareness.md` prompt 模板，声明 Agent 的定时任务能力（创建、查询、暂停、恢复、删除）
- 在 `DynamicPromptBuilder.buildSections()` 中新增 `schedule` section，将模板注入 system prompt
- 在注入时附带当前已有的定时任务摘要（让 Agent 感知到已有任务的存在）

## Non-goals

- 不将定时任务注册为 Tool（函数调用），避免污染 ToolRegistry
- 不修改 ScheduleCapability 的内部实现（4 层防幻觉机制保持不变）
- 不修改 ScheduleEngine 的调度逻辑
- 不改变定时任务的触发方式（仍然通过自然语言关键词匹配触发）

## Capabilities

### New Capabilities

_(无新增能力)_

### Modified Capabilities

- `schedule-management`: Agent 在对话中可感知并操作定时任务，而非仅靠隐式的关键词匹配

## Impact

- **packages/core**: `DynamicPromptBuilder` 新增 schedule section 构建逻辑；`AgentContext` 或 `ChatCapability` 需提供已有任务摘要数据
- **packages/core**: 新增 `templates/schedule-awareness.md` 模板文件
- **API**: 无变化，纯 prompt 层面改动
