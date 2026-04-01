## Context

当前 Agent.ts 对外暴露 7 个任务执行方法：`chat()`、`explore()`、`plan()`、`general()`、`runSubAgent()`、`runWorkflow()`、`dispatch()`。这些方法分别委托给 3 个 Capability（ChatCapability、WorkflowCapability、SubAgentCapability）和 1 个 Dispatcher，底层都调用 LLMRuntime（AI SDK streamText/generateText）。

**当前状态：**
- Server 端只用 `chat()` → ChatCapability，无 subagent tools
- CLI 用 `explore()`/`plan()`/`general()`/`runWorkflow()` → SubAgentCapability/WorkflowCapability
- `dispatch()` 和 `runSubAgent()` 无人调用
- ChatCapability 和 WorkflowCapability 各自构建 system prompt，逻辑重复
- SubAgentCapability 已把 explore/plan 注册为 AI SDK Tool，但 ChatCapability 不注入这些 tool

## Goals / Non-Goals

**Goals:**
- Agent 对外只暴露一个任务执行入口：`dispatch()`
- 所有执行路径统一：streamText + 全量工具 + subagent tools
- CLI 的强制角色模式通过 `forceMode` 参数实现，不走不同执行路径
- 保留所有 hooks（workflow:phase、tool:before/after、notification 等）
- 保留 session 持久化
- 保留心跳/超时控制

**Non-Goals:**
- 不改变 AI SDK 调用方式
- 不改变 ToolRegistry 的工具注册机制
- 不改变 subagent tool 的 AI SDK Tool 格式
- 不改变 WebSocket 协议或前端接口
- 不改变 Provider/Skill/Session/Timeout/Schedule Capability

## Decisions

### D1: 合并为 ExecutionCapability，而非保留三个 Capability

**选择:** 新建 ExecutionCapability，删除 ChatCapability + WorkflowCapability + SubAgentCapability

**备选:**
- A) 保留三个 Capability，让 dispatch 统一调用 → 仍需维护三套 system prompt 构建逻辑
- B) 只保留 WorkflowCapability，让 ChatCapability 变成薄包装 → 增加理解成本
- C) 新建 ExecutionCapability，完全替代三者 ✓

**理由:** 三者做的是同一件事（构建 prompt → 调 LLM → 返回结果），差异只是 prompt 内容和工具集。合并后 system prompt 构建只有一套逻辑，通过 `forceMode` 分支处理 CLI 场景。

### D2: forceMode 通过 prompt 约束实现，不走不同执行路径

**选择:** `forceMode` 只影响 system prompt 内容和工具集筛选，执行引擎不变

**备选:**
- A) forceMode 选择不同的 Capability 实例 → 回到多路径问题
- B) forceMode 只改 prompt + 工具集筛选 ✓

**实现：**
```
forceMode undefined → intelligent.md + 全量工具 + subagent tools
forceMode 'explore' → explore.md + 只读工具 (file只读, glob, grep, web-*)
forceMode 'plan'    → plan.md + 只读工具 (同上)
```

不注入 subagent tools 给 explore/plan 模式——只读角色不需要子 Agent。

### D3: chat() 保留为 dispatch() 的向后兼容别名

**选择:** `Agent.chat(prompt, opts)` 内部调用 `this.dispatch(prompt, opts)`

**理由:** Server 端 chat-handler.ts 只需改一行。CLI 的 executeChatMode 也可以继续用 `agent.chat()`。后续版本可标记 deprecated 再移除。

### D4: 保留 hooks 语义但重命名

**选择:** 保留 `workflow:phase` hook 名称不变

**备选:**
- A) 重命名为 `execution:phase` → 破坏性更大，且 hook 是用户的集成点
- B) 保持 `workflow:phase` 不变 ✓

**理由:** hook 已是公共 API，改名无实际收益。内部虽然不再叫 "Workflow"，但 hook 语义（phase 变化：start → execute → complete/error）仍然准确。

### D5: Session 持久化保留在 ExecutionCapability 内部

**选择:** ExecutionCapability.run() 完成后自动持久化到 session（与当前 Dispatcher 行为一致）

**实现：**
- 支持 `chatId` 参数用于切换 session
- 成功响应后自动 addUserMessage + addAssistantMessage
- 这是从 WorkflowCapability(无) / Dispatcher(有) / ChatCapability(无) 的行为统一

### D6: 删除 Dispatcher 类

**选择:** 删除 `src/agents/dispatch/` 目录，Dispatcher 的 session 管理和 cost 计算逻辑内联到 ExecutionCapability

**理由:** Dispatcher 当前只是 WorkflowCapability 的薄包装，加上 session 持久化和 cost 计算约 180 行。内联到 ExecutionCapability 避免多一层间接调用。

## Risks / Trade-offs

### [Risk] CLI 强制角色行为变化
**描述:** 当前 CLI explore/plan/general 走 `runner.execute()`（generateText，非流式），收敛后走 `streamText`，行为可能有细微差异。
**缓解:** streamText 的结果与 generateText 语义等价，且 streamText 支持中途返回。测试覆盖确保输出质量一致。

### [Risk] Server 端突然获得 subagent tools
**描述:** 当前 Server 端 `chat()` 无 subagent tools，收敛后所有路径都有。LLM 可能对简单问题调用不必要的 explore/plan。
**缓解:** 这是预期行为——LLM 有能力判断何时需要探索。如果确实不需要，LLM 不会浪费 token。如果后续发现成本问题，可通过 system prompt 或工具描述调优。

### [Risk] 测试迁移量大
**描述:** ChatCapability、WorkflowCapability、SubAgentCapability 各有独立测试，需迁移到 ExecutionCapability。
**缓解:** 逐个迁移，每个迁移后运行全量测试确保不回归。原测试可作为参考但不直接复用。

### [Risk] hooks 名称 `workflow:*` 与 Capability 名称不一致
**描述:** ExecutionCapability 取代了 WorkflowCapability，但 hooks 仍叫 `workflow:phase`。
**缓解:** 可接受的不一致。hook 名称是面向用户的语义标签，不是内部类名。
