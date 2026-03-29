## Context

Hive 当前子 Agent 管道采用**串行文本拼接**方式在 explore → plan → general 之间传递上下文。每次阶段切换，上一阶段的 LLM 文本输出被直接拼接到下一阶段的 prompt 中。这导致三个问题：

1. **信息丢失**：explore 阶段输出受 maxOutputTokens 限制，大量发现被截断；plan 拿到的是残缺摘要
2. **Token 浪费**：原始文本包含噪音（重复的文件路径、冗余描述），未经压缩直接传递
3. **无结构化传递**：纯文本无法区分「关键文件」和「参考文件」，下一阶段 LLM 无法高效利用

Claude Code 的做法：子 Agent 间通过 **compaction（压缩摘要）** 传递上下文，每个子 Agent 是**独立对话实例**（独立 messages 数组），prompt 针对当前任务**动态生成**。

## Goals / Non-Goals

**Goals:**
- 子 Agent 阶段间通过结构化摘要传递上下文，而非原始文本拼接
- 每个子 Agent 使用独立对话实例（独立 messages 数组），支持多轮工具调用
- 子 Agent 的 system prompt 根据任务上下文动态生成
- 子 Agent 输出结构化结果（关键文件、摘要、建议），便于下一阶段高效利用
- 保持向后兼容：WorkflowCapability 对外接口不变

**Non-Goals:**
- 不实现完整的 Claude Code compaction 系统（多轮对话压缩等）
- 不改变 Dispatcher 的分类逻辑（chat vs workflow 路由）
- 不改变工具系统本身
- 不实现子 Agent 并行执行

## Decisions

### D1: 阶段间传递结构化 JSON 摘要，而非纯文本

**选择**: 每个子 Agent 返回 `AgentPhaseResult`（结构化 JSON），包含：
```typescript
interface AgentPhaseResult {
  summary: string;           // 压缩后的摘要（< 2000 chars）
  keyFiles: string[];        // 关键文件路径列表
  findings: string[];        // 关键发现/结论
  suggestions: string[];     // 建议操作
  rawText: string;           // 原始完整输出（可选，用于 debug）
}
```

**替代方案**:
- A) 直接传递原始文本 → 当前方案，已有问题
- B) 用 LLM 做摘要压缩 → 增加一次 LLM 调用成本，但压缩质量高
- C) 规则提取 → 不依赖 LLM，但提取质量差

**决策**: 采用 B）LLM 压缩 + 结构化输出。在阶段切换时调用一次 LLM（用低成本模型如 haiku），将上一阶段的完整输出压缩为结构化摘要。压缩后的摘要 token 量可控，信息密度高。

### D2: DynamicPromptBuilder 动态构建 system prompt

**选择**: 新增 `DynamicPromptBuilder`，根据以下输入动态构建 system prompt：
- 基础角色模板（从 .md 加载）
- 当前任务描述
- 前置阶段的结构化摘要（keyFiles, findings, suggestions）
- 可用工具列表（自动从 AgentConfig 获取）

**替代方案**:
- A) 固定模板 + 变量替换 → 当前方案，灵活性差
- B) 完全由 LLM 生成 → 不可控，成本高

**决策**: 采用模板 + 动态注入的混合方式。基础角色从 .md 加载，但上下文部分（前置阶段结果）由 DynamicPromptBuilder 动态格式化注入。

### D3: 子 Agent 使用独立对话实例

**选择**: 每个子 Agent 创建独立的 `messages` 数组，而非共享。通过 `AgentRunner.execute()` 的 `messages` 参数传入独立的初始消息。

**实现方式**: 修改 `AgentRunner.execute()` 和 `LLMRuntime.run()`，支持传入独立的 messages 数组（当前只支持 prompt string）。

### D4: 压缩模型策略

**选择**: Context Compactor 使用低成本模型（haiku 级别）执行压缩，不使用主模型。压缩 prompt 固定，输出格式固定为 JSON。

## Risks / Trade-offs

- **[Risk] 压缩丢失关键信息** → Mitigation: 压缩 prompt 明确要求保留所有文件路径和关键发现；保留 rawText 作为 fallback
- **[Risk] 增加一次 LLM 调用延迟** → Mitigation: 使用低成本模型（haiku），压缩耗时约 1-2 秒，相比整体工作流可接受
- **[Risk] 结构化输出解析失败** → Mitigation: 压缩 prompt 使用 JSON schema 约束输出；解析失败时 fallback 到原始文本传递
- **[Trade-off] 独立对话实例增加内存占用** → Mitigation: 子 Agent 完成后立即释放 messages 数组，不长期持有
