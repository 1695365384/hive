## Context

ExecutionCapability 当前有三道 anti-hallucination 防线，嵌入在 `run()` 方法的主执行流程后（`ExecutionCapability.ts:214-282`）：

1. **Defense 1** — `needsVerification(task)`: 用 `task.length > 5` 硬编码判断是否需要验证
2. **Defense 2** — 零工具调用拦截: 如果 `runtimeResult.tools.length === 0`，重新发送 prompt 要求必须调用工具
3. **Defense 3** — Steps 自省: 把执行记录格式化后 + 全量工具再次发给 LLM，让 LLM 判断是否完成

问题：Defense 3 给 LLM 全量工具权限，本质上重新执行任务，可能覆盖正确结果。`needsVerification()` 的硬编码阈值无法区分信息查询和操作任务。

## Goals / Non-Goals

**Goals:**
- 基于工具调用结果的确定性信号判断任务完成度
- 零额外 LLM 调用（不增加延迟和成本）
- 信息查询任务（Read/Glob/Grep）有成功结果即判定完成
- 操作任务（Write/Edit/Bash）检查写操作是否成功
- 无法判断的任务类型保守处理（信任原始结果）

**Non-Goals:**
- 不做 LLM-as-Judge 验证（避免"用幻觉检测幻觉"）
- 不做输出文本的 grounding 检查（留作后续优化）
- 不修改 `DispatchResult` 对外接口
- 不涉及 Server/Channel/Desktop 层

## Decisions

### D1: 从工具结果推断任务类型，不额外调用 LLM

**选择**: 遍历 `runtimeResult.tools` 和 `runtimeResult.steps` 中的工具调用记录，按工具名称分类：
- 只包含读工具（Read/Glob/Grep/WebSearch/WebFetch/Env）→ `information`
- 包含写工具（Write/Edit/Bash/SendFile）→ `action`
- 零工具调用 → `unknown`
- 混合读写 → `action`（保守策略）

**替代方案**: 单独调用轻量 LLM 做任务分类 → 额外延迟和成本，且分类准确率不一定比基于事实的推断高。放弃。

**替代方案**: 用正则/关键词匹配用户输入分类 → 本质上还是硬编码，用户措辞千变万化。放弃。

### D2: Evidence-Based 完成度检查替代 LLM 自省

**选择**: 检查 `runtimeResult` 中的确定性信号：
- `information` 类型：至少一个工具成功且返回非空数据 → 完成
- `action` 类型：所有写操作工具都返回成功 → 完成；部分失败 → 未完成但保留结果
- `unknown` 类型：信任原始结果（保守策略）

**信号来源**: `runtimeResult.steps` 中每个 step 的 `toolCalls` 数组包含工具名和结果。需要从 `StepResult` 类型中提取足够信息。

**替代方案**: 保留 LLM 自省但限制为只读工具 → 仍然是非确定性验证，且增加延迟。放弃。

### D3: 删除 Defense 3（Steps 自省），保留 Defense 2 但差异化处理

**选择**:
- 删除 Defense 3 及其所有相关方法（`buildIntrospectionMessages`、`formatStepsSummary`）
- 保留 Defense 2（零工具调用拦截），但根据推断的任务类型差异化：
  - `unknown` + 零工具 → 触发拦截（可能是 Agent 偷懒的操作任务）
  - `information` + 零工具 → 不拦截（可能是纯知识问答）

**替代方案**: 完全删除 Defense 2 → 对于确实需要工具但 Agent 偷懒的场景缺少保护。保留但差异化更安全。

### D4: 验证结果只标记，不覆盖

**选择**: 验证检查产生的 verdict 只影响日志记录和 hook 事件（`notification:push`），不修改 `result.text`。即使判定"未完成"，仍然返回 Agent 的原始输出。

**替代方案**: 未完成时触发重试 → 可能导致无限循环，增加成本。放弃。

## Risks / Trade-offs

- **[Risk] 某些边缘任务被误分类** → `unknown` 类型保守处理（信任原始结果），不会比当前行为更差
- **[Risk] 工具返回成功但实际未完成用户意图** → 这是工具层面的问题，不是验证系统的问题。工具返回 `ok: true` 意味着操作本身成功，内容是否"足够"由用户判断
- **[Risk] 删除 Defense 3 后缺少深层验证** → 当前 Defense 3 的"验证"本质上是重新执行，不是真正的验证。Evidence-based 检查覆盖了主要场景
- **[Trade-off] 不做 grounding 检查** → Agent 可能在输出中编造工具未返回的信息。这是后续优化方向，当前优先解决"误判完成"问题

## Open Questions

- `StepResult` 中 `toolCalls` 的结果格式是否包含足够的成功/失败信息？需要检查 `LLMRuntime.ts` 中的实际结构
