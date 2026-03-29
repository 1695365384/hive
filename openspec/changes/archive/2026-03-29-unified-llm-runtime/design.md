## Context

Hive 的 LLM 调用存在两套并行系统：

- **Provider 系统**（已建好）：`ProviderManager` → `ProviderAdapter` → `LanguageModelV3`，支持 Anthropic/OpenAI/Google/openai-compatible，能创建任意 Provider 的模型实例
- **执行系统**（锁定 Anthropic）：`ChatCapability` / `AgentRunner` 都直接调用 claude-agent-sdk 的 `query()`，通过环境变量传递配置

两套系统没有连接——`ProviderManager.getModel()` 几乎没有被实际调用。

同时，执行层存在三层间接：`Agent.chat()` → `ChatCapability.send()` → `query()`，以及 `Agent.explore()` → `SubAgentCapability.explore()` → `AgentRunner.execute()` → `query()`。两层间接做的是本质相同的事：调用 LLM 并处理响应。

迁移到 AI SDK 后，`generateText()` 和 `streamText()` 已经内置了 agentic loop，runner 的手动消息遍历变得不必要。这是简化架构的时机。

约束：
- `Agent.chat()`, `Agent.explore()`, `Agent.plan()`, `Agent.general()`, `Agent.dispatch()` 的公开 API 签名不变
- Provider 配置格式不变（`ExternalConfig` / `ProviderConfig`）
- Hooks 系统（`tool:before`, `tool:after`, `agent:thinking`, `timeout:api`）继续工作
- 超时控制和心跳机制继续工作
- 会话管理（Session）不受影响

## Goals / Non-Goals

**Goals:**
- 所有 LLM 调用通过 AI SDK，支持任意 Provider
- 统一执行引擎替代 ChatCapability + SubAgentCapability + AgentRunner
- 流式和非流式调用走同一个引擎，通过配置切换
- 保留 hooks / 超时 / 心跳等生命周期能力
- 删除 `@anthropic-ai/claude-agent-sdk` 依赖
- 保持公开 API 向后兼容

**Non-Goals:**
- 不做 MCP Server 协议层集成（memory-tools 直接用 AI SDK tool() 定义）
- 不改变 Dispatcher 的分类逻辑（仅替换底层 LLM 调用）
- 不改变 Session / Workflow / Schedule 等无关模块
- 不引入新的 Provider（复用现有 ProviderAdapter 体系）

## Decisions

### D1: 统一执行引擎 LLMRuntime

**选择**: 新建 `LLMRuntime` 类，作为唯一的 LLM 调用入口

**替代方案**:
- A) 在现有 ChatCapability 内部替换底层 → 保留了冗余的分层
- B) 直接在 Agent 类中调用 AI SDK → Agent 类职责过重

```typescript
interface RuntimeConfig {
  // 模型
  model?: string;
  providerId?: string;

  // 内容
  prompt: string;
  system?: string;
  messages?: ModelMessage[];  // 多轮历史（chat 场景）

  // 工具
  tools: Record<string, AITool>;
  maxSteps: number;

  // 执行模式
  streaming?: boolean;  // default: false
  abortSignal?: AbortSignal;

  // Hooks
  onText?: (text: string) => void;
  onToolCall?: (toolName: string, input: unknown) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
  onStepFinish?: (step: StepResult) => void;
}

interface RuntimeResult {
  text: string;
  tools: string[];
  usage?: { input: number; output: number };
  steps: StepResult[];
  success: boolean;
  error?: string;
  duration: number;
}
```

**理由**: 一个类、一个 `run()` 方法，streaming 模式内部用 `streamText()`，非 streaming 用 `generateText()`。调用方不需要关心底层差异。

### D2: Agent 类直接持有 LLMRuntime

**选择**: 删除 ChatCapability 和 SubAgentCapability，Agent 类直接持有 LLMRuntime

**替代方案**: 保留 Capability 接口但让 ChatCapability 内部委托 LLMRuntime → 多余的间接层

```typescript
class Agent {
  private runtime: LLMRuntime;

  // 公开 API 不变
  async chat(prompt: string, options?: AgentOptions): Promise<string>;
  async explore(prompt: string, thoroughness?: ThoroughnessLevel): Promise<string>;
  async plan(prompt: string): Promise<string>;
  async general(prompt: string): Promise<string>;
  async dispatch(task: string, options?: DispatchOptions): Promise<DispatchResult>;
}
```

**理由**: Capability 层的注册/初始化机制是 claude-agent-sdk 时代的产物，迁移后每个"能力"本质上就是 `runtime.run()` 的不同配置，不需要单独的类。

### D3: Agent 配置（explore/plan/general）内化为 RuntimeConfig preset

**选择**: 在 LLMRuntime 中定义 preset 配置，不再需要独立的 `BUILTIN_AGENTS` / `CORE_AGENTS` 常量

```typescript
const AGENT_PRESETS = {
  explore: {
    system: EXPLORE_AGENT_PROMPT,
    tools: readOnlyTools,     // Read, Glob, Grep
    maxSteps: 5,
    model: 'haiku',           // 默认用便宜模型
  },
  plan: {
    system: PLAN_AGENT_PROMPT,
    tools: readOnlyTools,
    maxSteps: 10,
  },
  general: {
    system: GENERAL_AGENT_PROMPT,
    tools: allTools,           // Read, Write, Edit, Bash, ...
    maxSteps: 20,
  },
};
```

**理由**: Agent 配置是 runtime 配置的子集，不需要独立的注册表。

### D4: 流式模式用于主 chat，非流式用于子 Agent 和分类器

**选择**: `streaming: true` 仅在 `Agent.chat()` 中使用，其他场景默认 `streaming: false`

```typescript
// Agent.chat() — 流式 + hooks + 超时
const result = await this.runtime.run({
  ...config,
  streaming: true,
  onText: options?.onText,
  onToolCall: (name) => this.emitHook('tool:before', { ... }),
  onToolResult: (name) => this.emitHook('tool:after', { ... }),
  abortSignal: combinedSignal,
});

// Agent.explore() — 非流式，只要结果
const result = await this.runtime.run({
  ...AGENT_PRESETS.explore,
  prompt: buildExplorePrompt(prompt, thoroughness),
});
```

**理由**: 子 Agent 和分类器不需要流式输出，`generateText()` 更简单直接。

### D5: 超时和心跳在 Agent 层实现，不在 LLMRuntime 中

**选择**: LLMRuntime 是纯粹的 LLM 调用层，超时/心跳逻辑保留在 Agent 类中

```typescript
// Agent.chat() 中
const { controller, clear, timeoutPromise } = this.timeoutCap.createAbortController(apiTimeout);
const result = await Promise.race([
  this.runtime.run({ ...config, abortSignal: controller.signal }),
  timeoutPromise,
]);
```

**理由**: 关注点分离。LLMRuntime 负责"正确调用 LLM"，Agent 负责"生命周期管理"。这样 LLMRuntime 可以独立测试，不需要 mock 超时/心跳。

### D6: memory-tools 从 MCP Server 改为 AI SDK tool()

**选择**: 删除 `createSdkMcpServer`，偏好和记忆工具直接用 AI SDK `tool()` 定义

```typescript
// 之前：通过 MCP Server 暴露
const mcpServer = createSdkMcpServer({
  name: 'memory',
  tools: [tool('preferences', ...), tool('memory', ...)]
});

// 之后：直接定义为 AI SDK tool
const memoryTools = {
  preferences: tool({
    description: 'Get/set user preferences',
    inputSchema: z.object({ key: z.string(), value: z.string().optional() }),
    execute: async ({ key, value }) => { ... },
  }),
  memory: tool({
    description: 'Search and manage agent memory',
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => { ... },
  }),
};
```

**理由**: MCP 协议层在这个场景下是过度抽象。只有 2-3 个工具，直接定义更简单、类型更安全。未来如果需要接入外部 MCP Server，可以在 ProviderAdapter 层做桥接。

### D7: 消息类型系统直接使用 AI SDK 原生类型

**选择**: 删除 `SdkMessage` / `ResultMessage` / `AssistantMessage` / `ToolProgressMessage` 和所有 `isXxxMessage()` 类型守卫

**替代方案**: 保留类型守卫做适配层 → 把技术债延后，增加维护成本

AI SDK 事件类型映射：
- `text-delta` → 替代 `isTextBlock()` 文本提取
- `tool-call` → 替代 `isToolProgressMessage()` + `isToolUseBlock()`
- `tool-result` → 替代 result 消息中的 tool:after 触发
- `finish` → 替代 `isUsageMessage()` + 最终结果
- `reasoning-delta` → 新增能力，映射到 `agent:thinking` hook

**理由**: AI SDK 的事件类型是 Provider 无关的统一格式，switch/case 天然类型安全，不需要手动类型守卫。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 非 Anthropic 模型的 tool calling 质量不如 Claude | 这是模型能力问题，不是 SDK 问题；AI SDK 确保协议兼容，用户自行选择合适模型 |
| 迁移范围大，可能引入回归 bug | 渐进式迁移（Phase 1-4），每阶段独立测试验证 |
| 删除 Capability 层影响现有插件/扩展 | Capability 接口保留但简化；公开 API 不变，外部代码无需修改 |
| `createSdkMcpServer` 无直接替代 | 当前只有 memory-tools 使用，改为 AI SDK tool() 定义（D6） |
| ChatCapability 中的 toolStartTimes 追踪逻辑在 AI SDK 中不存在 | AI SDK 的 tool-call/tool-result 是精确配对的，不需要追踪逻辑，这是改进 |

## Open Questions

- 是否需要在 LLMRuntime 层支持 fallback Provider（主 Provider 失败时自动切换）？
- 未来是否需要恢复 MCP Server 集成（让外部应用通过 MCP 接入 Hive 工具）？如果是，在 ProviderAdapter 层预留桥接接口
- Agent.chat() 的 `agents` 选项（允许用户传入自定义 Agent 定义）在新架构中如何体现？作为 RuntimeConfig 的一部分？
