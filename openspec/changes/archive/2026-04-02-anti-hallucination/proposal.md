## Why

大模型 Agent 存在声明式幻觉：声称完成了操作但实际未执行（如"文件已修改"但未调用 file 工具），或声称"做不到"但实际有对应工具可用。根本原因是 LLM 是文本预测器，生成"已经完成"时不会自动对照实际工具调用记录。当前 `RuntimeResult.steps` 包含完整执行证据，但在映射为 `DispatchResult` 时被丢弃，且 Agent 声明完成前没有任何校验机制。

## What Changes

- `ExecutionCapability.run()` 末尾新增三防线反幻觉检查
- 防线 1（prompt 预防）：`intelligent.md` 新增执行协议，强制 Agent "先执行后声明"
- 防线 2（零工具调用拦截）：代码层检测 `tools.length === 0` 的 action task，注入反馈重试一次
- 防线 3（steps 注入自省）：`tools.length > 0` 时将 steps 摘要注入对话，让 Agent 自行确认是否完成，未完成则继续执行一轮
- `DispatchResult` 保留 `steps` 字段（当前被丢弃），作为验证的事实依据
- 简单任务（纯问答）不触发任何防线，直接返回（向后兼容）

## Non-goals

- 不引入外部验证器或额外 LLM 模型
- 不引入复杂度自评标签或关键词映射表
- 不改变子 Agent（Explore/Plan/Evaluator）的执行逻辑
- 不改变 LLMRuntime、ToolRegistry、Hook 系统

## Capabilities

### New Capabilities
- `anti-hallucination`: 三防线反幻觉机制——prompt 预防 + 零工具调用拦截 + steps 注入自省

### Modified Capabilities
- `unified-execution-engine`: DispatchResult 新增 steps 字段；run() 末尾增加三防线检查

## Impact

- **packages/core** — ExecutionCapability（核心改动）、intelligent.md prompt、类型定义
- **packages/core/src/agents/types/capabilities.ts** — DispatchResult 类型扩展（新增可选 steps 字段）
- **packages/core/src/agents/runtime/types.ts** — StepResult 类型已有，无需改动
- **API 兼容性** — DispatchResult 新增字段为可选，不破坏现有调用方
- **成本** — 零额外 LLM 调用（防线 1/2 纯代码）；防线 3 仅在 action task 触发时复用当前模型 1 次额外调用
