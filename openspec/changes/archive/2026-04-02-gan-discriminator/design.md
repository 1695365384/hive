## Context

当前 Hive 的 Agent 执行是单次通过模式：用户任务 → Main Agent 执行 → 返回结果。RuntimeResult.steps 包含完整的工具调用记录（工具名、输入、输出、错误），但在映射为 DispatchResult 时被丢弃。Evaluator 子 Agent 已定义（20 turns、全工具权限），但从未在 pipeline 中自动调用。

声明式幻觉发生在 Agent 的文本输出与实际工具调用不一致时。当前系统无法检测这种不一致。

## Goals / Non-Goals

**Goals:**
- 复杂任务执行后自动验证 Agent 声明与实际行为的一致性
- 检测并纠正虚假完成、虚假拒绝、部分完成三种幻觉模式
- 验证失败时提供结构化反馈，支持最多 3 轮重试
- 简单任务零额外开销，向后兼容

**Non-Goals:**
- 不改变子 Agent 自身的执行逻辑
- 不引入真正的神经网络训练或参数更新
- 不改变 LLMRuntime、AgentRunner、ToolRegistry、Hook 系统

## Decisions

### D1: Discriminator 作为 ExecutionCapability 内部方法

**选择**: 在 ExecutionCapability 中新增 `verifyResult()` 和 `buildVerificationPrompt()` 私有方法，而非独立模块。

**理由**: ExecutionCapability 已持有 RuntimeResult（含 steps）和对话历史，验证循环在 dispatch() 返回前执行最自然，避免跨模块传递 steps 数据。

**替代方案**: 独立 Discriminator 类 — 需要传入 steps、context、runner 等多个依赖，增加耦合。

### D2: 复杂度自评通过 Prompt 约束 + 正则提取

**选择**: 在 intelligent.md 中引导 Agent 在输出末尾标注 `[x-simple]` 或 `[x-complex]`，dispatch() 用正则 `/\[x-(simple|complex)\]/` 提取。

**理由**: 最简单的方式，不需要额外的 LLM 调用。未标注时默认走简单路径（向后兼容）。Prompt 约束在 system prompt 中，Agent 遵守率高。

**替代方案**:
- 结构化 JSON 输出 — 增加解析复杂度，且 LLM 不一定稳定输出 JSON
- 额外 Haiku 调用判断复杂度 — 增加成本，不值得

### D3: 两层验证架构

**选择**: Layer 1 规则验证（零成本、确定性）+ Layer 2 Haiku 语义验证（低成本）。

**理由**: 规则验证能快速捕获大部分"虚假完成"（声明 vs 工具调用不匹配），且无幻觉风险。Haiku 验证覆盖规则无法处理的"虚假拒绝"和语义层面的一致性检查。两层串行，Layer 1 PASS 后才进入 Layer 2。

**替代方案**: 纯 LLM 验证 — 成本更高，且 LLM 本身可能产生验证幻觉。规则层作为第一道防线更可靠。

### D4: 反馈以用户消息形式注入对话历史

**选择**: 验证失败时，将完整上下文（原始任务 + 工具调用记录 + 验证失败原因）构造为用户消息，追加到对话历史中，然后重新调用 LLMRuntime。

**理由**: Agent 能看到自己的"黑历史"和具体失败原因，自我修正效果好。利用现有对话机制，不需要新的消息传递通道。

**替代方案**:
- 仅返回错误码 — Agent 不知道哪里错了，重试效率低
- 修改 system prompt — 影响 Agent 行为全局，副作用大

### D5: Evaluator 使用 Haiku 4.5

**选择**: Layer 2 语义验证使用 Haiku 4.5 模型。

**理由**: 验证任务是结构化的判断任务（比对声明与事实），不需要深度推理。Haiku 4.5 成本约为 Sonnet 的 1/3，判断力足够。验证 Prompt 固定模板化，token 消耗可控（预计 < 2K token/次）。

### D6: DispatchResult 保留 steps

**选择**: 在 RuntimeResult → DispatchResult 映射时保留 `steps: StepResult[]` 字段。

**理由**: steps 是验证的事实依据，也是重试反馈的核心数据。作为可选字段添加，不破坏现有调用方（向后兼容）。

## Risks / Trade-offs

**[Risk] 正则提取复杂度标签不可靠** → Agent 可能不输出标签或输出格式错误。缓解：未匹配时默认走简单路径（零风险回退），且 system prompt 中明确约束输出格式。

**[Risk] 规则验证的声明关键词表覆盖不全** → 新的工具或声明模式可能遗漏。缓解：规则表可配置化（数组），后续通过配置扩展；Layer 2 Haiku 兜底语义层面的遗漏。

**[Risk] Haiku 验证本身产生幻觉** → Haiku 可能误判 PASS 或 FAIL。缓解：规则层作为第一道确定性防线减少 Haiku 调用频率；Haiku Prompt 结构化要求输出明确的 PASS/FAIL + 原因，降低模糊输出概率。

**[Risk] 重试循环增加延迟和成本** → 最多 3 轮 × (主 Agent 执行 + Evaluator 验证)。缓解：仅复杂任务触发；规则验证零成本；Haiku 验证 < 2K token；总额外延迟可控在 30s 内。

**[Risk] 对话历史膨胀** → 重试时注入的反馈消息会增加上下文长度。缓解：最多 3 轮，每轮反馈消息 < 1K 字符；DynamicPromptBuilder 已有 token budget 管理机制。
