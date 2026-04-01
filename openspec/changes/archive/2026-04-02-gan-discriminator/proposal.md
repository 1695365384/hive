## Why

大模型 Agent 存在声明式幻觉：声称完成了操作但实际未执行（如"图片已发送"但未调用 send-file），或声称"做不到"但实际有对应工具可用。复杂任务（多步骤、涉及文件修改/命令执行）中此问题尤为严重，直接导致任务完成率下降。需要引入基于事实验证的对抗循环，在返回结果前校验 Agent 声明与实际行为的一致性。

## What Changes

- 在 ExecutionCapability 中新增验证循环：复杂任务执行后自动触发 Evaluator 子 Agent 验证最终结果
- 新增两层验证机制：Layer 1 规则验证器（声明 vs 工具调用记录，零成本）+ Layer 2 Haiku 语义验证器（检测虚假拒绝/能力低估）
- DispatchResult 保留 RuntimeResult.steps（当前被丢弃），作为验证的事实依据
- intelligent.md 新增复杂度自评指令，Agent 在输出末尾标注 `[x-simple]` 或 `[x-complex]`
- 验证失败时将完整上下文（任务 + 工具调用记录 + 失败原因）以用户消息形式注入对话历史，Main Agent 重试，最多 3 轮
- 简单任务不触发任何子 Agent，直接返回结果（向后兼容）

## Non-goals

- 不改变子 Agent（Explore/Plan/Evaluator）自身的执行逻辑
- 不引入真正的神经网络训练或梯度更新
- 不改变 LLMRuntime、AgentRunner、ToolRegistry、Hook 系统
- 不为简单任务增加任何额外开销

## Capabilities

### New Capabilities
- `discriminator-verification`: GAN 风格的声明验证循环——规则验证 + LLM 语义验证 + 反馈重试

### Modified Capabilities
- `unified-execution-engine`: DispatchResult 新增 steps 字段；dispatch() 末尾增加验证循环分支

## Impact

- **packages/core** — ExecutionCapability（核心改动）、intelligent.md prompt、类型定义
- **packages/core/src/agents/types/capabilities.ts** — DispatchResult 类型扩展
- **packages/core/src/agents/types/pipeline.ts** — 新增验证结果类型
- **API 兼容性** — DispatchResult 新增字段为可选，不破坏现有调用方
- **成本** — 复杂任务额外消耗 Haiku 4.5 token（验证层 2），预计每次验证 < 2K token
