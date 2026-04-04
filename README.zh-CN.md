<div align="center">
  <img src="logo.svg" alt="Hive Logo" width="120" height="120">

  <h1>Hive</h1>

  <p><strong>TypeScript 多 Agent 编排 SDK</strong></p>
  <p>Coordinator-Worker 架构，内置成本控制、权限分层、国产 LLM 支持。</p>

  <p>
    <a href="#快速开始">快速开始</a> &middot;
    <a href="#架构">架构</a> &middot;
    <a href="#api-参考">API</a> &middot;
    <a href="#支持的提供商">提供商</a> &middot;
    <a href="#常见问题">常见问题</a>
  </p>

  <p>
    <code>npm i @bundy-lmw/hive-core</code>
  </p>

  <p>
    <img src="https://img.shields.io/badge/Node.js-18+-green" alt="Node.js">
    <img src="https://img.shields.io/badge/TypeScript-5.3+-blue" alt="TypeScript">
    <img src="https://img.shields.io/badge/1337%20tests-passing-brightgreen" alt="Tests">
    <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
  </p>

  <p><a href="./README.md">English</a></p>
</div>

---

## 为什么选择 Hive

| 问题 | Hive 的做法 |
|:-----|:-----------|
| 简单查询也消耗大量 token | Coordinator-Worker 模式 — 只在需要时才启动 Worker |
| 所有任务都用最贵的模型 | Provider 预设 + 按任务指定模型（`DispatchOptions.modelId`） |
| 只读操作可能误改文件 | Worker Agent 按类型限制工具权限（explore/plan = 只读，general = 全权限） |
| 国产 LLM 需要手动适配参数 | 内置 13 个 Provider 适配器（GLM、DeepSeek、Qwen、Kimi、ERNIE、Claude、GPT、Gemini 等） |
| 长时间运行的 Agent 失去响应 | 内置心跳、卡死检测、中断信号（abort signal） |

---

## 快速开始

### 安装

```bash
npm i @bundy-lmw/hive-core
```

### 配置

```bash
export GLM_API_KEY=your-key
# 或: DEEPSEEK_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY
```

### 调度

```typescript
import { Agent } from '@bundy-lmw/hive-core';

const agent = new Agent();
const result = await agent.dispatch('帮我重构登录模块');
// Coordinator 自动启动 explore → plan → general Worker

console.log(result.text);     // 最终输出
console.log(result.usage);    // { input: 1234, output: 567 }
console.log(result.tools);    // ['glob', 'file', 'bash']
console.log(result.duration); // 毫秒
```

### 事件流

```typescript
const result = await agent.dispatch('分析认证流程', {
  onPhase: (phase, msg) => console.log(`[${phase}] ${msg}`),
  onText: (text) => process.stdout.write(text),
  onTool: (tool, input) => console.log(`→ ${tool}`),
  onToolResult: (tool, result) => console.log(`← ${tool}`),
  onReasoning: (thought) => console.log(`💭 ${thought}`),
  abortSignal: controller.signal,
});
```

### HTTP 服务

```bash
pnpm --filter @bundy-lmw/hive-server start
# POST http://localhost:4450/api/chat
# WS   ws://localhost:4450/ws/chat
```

---

<!-- TODO: 添加工作流演示 GIF -->

---

## 架构

Hive 采用 **Coordinator-Worker** 模式。`Agent` 是唯一入口，`dispatch()` 委托给 `CoordinatorCapability`，后者管理 LLM 循环，按需启动专门的 **Worker Agent**。

<div align="center">
  <img src="docs/architecture.svg" alt="Hive 系统架构" width="860">
</div>

### Worker Agent 工具权限

| 工具 | explore | plan | general | schedule |
|:-----|:--------|:-----|:--------|:---------|
| `file` (读) | ✅ | ✅ | ✅ | — |
| `glob` | ✅ | ✅ | ✅ | — |
| `grep` | ✅ | ✅ | ✅ | — |
| `web-search` | ✅ | ✅ | ✅ | — |
| `web-fetch` | ✅ | ✅ | ✅ | — |
| `env` | ✅ | ✅ | ✅ | — |
| `bash` | — | — | ✅ | — |
| `file` (写) | — | — | ✅ | — |
| `ask-user` | — | — | ✅ | — |
| `send-file` | — | — | ✅ | — |
| `schedule` | — | — | — | ✅ |

### 能力模块

<div align="center">

<table style="border:none; margin: 0 auto;">
<tr style="border:none;">
  <td style="border:none; padding:4px 6px;"><code style="background:#f3f4f6; padding:4px 10px; border-radius:6px; font-size:12px; border:1px solid #e5e7eb;">Coordinator</code></td>
  <td style="border:none; padding:4px 0; color:#9ca3af; font-size:12px;">调度 · Worker 编排 · 成本追踪</td>
</tr>
<tr style="border:none;">
  <td style="border:none; padding:4px 6px;"><code style="background:#f3f4f6; padding:4px 10px; border-radius:6px; font-size:12px; border:1px solid #e5e7eb;">Provider</code></td>
  <td style="border:none; padding:4px 0; color:#9ca3af; font-size:12px;">注册 · 切换 · AI SDK 集成</td>
</tr>
<tr style="border:none;">
  <td style="border:none; padding:4px 6px;"><code style="background:#f3f4f6; padding:4px 10px; border-radius:6px; font-size:12px; border:1px solid #e5e7eb;">Skill</code></td>
  <td style="border:none; padding:4px 0; color:#9ca3af; font-size:12px;">加载 · 匹配 · 指令生成</td>
</tr>
<tr style="border:none;">
  <td style="border:none; padding:4px 6px;"><code style="background:#f3f4f6; padding:4px 10px; border-radius:6px; font-size:12px; border:1px solid #e5e7eb;">Session</code></td>
  <td style="border:none; padding:4px 0; color:#9ca3af; font-size:12px;">SQLite 持久化 · 多会话</td>
</tr>
<tr style="border:none;">
  <td style="border:none; padding:4px 6px;"><code style="background:#f3f4f6; padding:4px 10px; border-radius:6px; font-size:12px; border:1px solid #e5e7eb;">Timeout</code></td>
  <td style="border:none; padding:4px 0; color:#9ca3af; font-size:12px;">心跳 · 卡死检测 · 中断</td>
</tr>
<tr style="border:none;">
  <td style="border:none; padding:4px 6px;"><code style="background:#f3f4f6; padding:4px 10px; border-radius:6px; font-size:12px; border:1px solid #e5e7eb;">Schedule</code></td>
  <td style="border:none; padding:4px 0; color:#9ca3af; font-size:12px;">定时任务 · 生命周期管理</td>
</tr>
</table>

</div>

### Server (`@bundy-lmw/hive-server`)

基于 Hono 的 HTTP + WebSocket 服务，封装 Agent SDK：

| 路由 | 方法 | 说明 |
|:-----|:-----|:-----|
| `/health` | GET | 健康检查 |
| `/api/chat` | POST | 对话端点 |
| `/api/sessions` | GET | 列出会话 |
| `/api/sessions/:id` | GET/DELETE | 会话 CRUD |
| `/ws/chat` | WS | 对话流式传输 |
| `/ws/admin` | WS | 管理面板 |
| `/webhook/:plugin/:appId` | POST | 插件 Webhook |

---

## API 参考

### Agent

```typescript
import { Agent } from '@bundy-lmw/hive-core';

const agent = new Agent(options?);
await agent.initialize();

// 任务执行
const result = await agent.dispatch(task: string, options?: DispatchOptions): Promise<DispatchResult>;

// Provider 管理
agent.useProvider(name: string, apiKey?: string): boolean;
agent.listProviders(): ProviderConfig[];
agent.listAllProviders(): Promise<ModelsDevProvider[]>;
agent.listProviderModels(providerId: string): Promise<ModelSpec[]>;

// 技能管理
agent.listSkills(): Skill[];
agent.matchSkill(input: string): SkillMatchResult | null;
agent.registerSkill(skill: Skill): void;

// 会话管理
await agent.createSession(config?): Promise<Session>;
await agent.loadSession(sessionId: string): Promise<Session | null>;
agent.getSessionMessages(): Message[];

// 生命周期
await agent.dispose();
```

### DispatchOptions

```typescript
interface DispatchOptions {
  chatId?: string;
  cwd?: string;
  maxTurns?: number;
  modelId?: string;           // 为本次任务指定模型
  systemPrompt?: string;
  abortSignal?: AbortSignal;  // 中途取消
  onPhase?(phase: string, message: string): void;
  onText?(text: string): void;
  onTool?(tool: string, input?: unknown): void;
  onToolResult?(tool: string, result: unknown): void;
  onReasoning?(text: string): void;
}
```

### DispatchResult

```typescript
interface DispatchResult {
  text: string;
  success: boolean;
  duration: number;            // 毫秒
  tools: string[];             // 使用的工具
  usage?: { input: number; output: number };
  cost?: { input: number; output: number; total: number };
  steps?: StepResult[];
  error?: string;
}
```

---

## 支持的提供商

### 内置适配器

| 适配器 | 提供商 | 协议 |
|:------|:------|:-----|
| `AnthropicAdapter` | Claude (opus, sonnet, haiku) | Anthropic API |
| `OpenAIAdapter` | GPT-4o, GPT-4-turbo | OpenAI API |
| `GoogleAdapter` | Gemini | Google AI |
| `OpenAICompatibleAdapter` | GLM, DeepSeek, Qwen, Kimi, ERNIE, OpenRouter, Groq, xAI, Mistral, LiteLLM | OpenAI 兼容 |

开箱即用 13 个 Provider。任何 OpenAI 兼容端点只需 `baseUrl` + `apiKey` 即可接入，无需改源码。

### 国产大模型预设

| 提供商 | 模型示例 | 特点 |
|:------|:--------|:-----|
| GLM（智谱） | glm-5, glm-4.7 | 长文本、多模态 |
| Qwen（通义千问） | qwen3-max, qwen-plus | 阿里云 |
| DeepSeek | deepseek-chat, deepseek-reasoner | 高性价比 |
| Kimi（月之暗面） | moonshot-v1-128k | 超长上下文 |
| ERNIE（文心一言） | ernie-4.0-8k | 百度 |

---

## Hook 系统

通过优先级 Hook 拦截任何生命周期事件：

```typescript
agent.context.hookRegistry.on('tool:before', async (ctx) => {
  if (ctx.toolName === 'bash') {
    return { proceed: false, error: '当前环境禁止使用 bash' };
  }
}, { priority: 'highest' });
```

### 可用 Hook

| Hook | 触发时机 |
|:-----|:--------|
| `session:start` / `end` / `error` | 会话生命周期 |
| `tool:before` / `after` | 工具执行（可拦截） |
| `provider:beforeChange` / `afterChange` | Provider 切换 |
| `timeout:stalled` / `health:heartbeat` | 健康监控 |
| `agent:thinking` / `task:progress` | Agent 内省 |
| `notification:push` | 渠道通知 |

---

<details>
<summary><b>项目结构</b></summary>

```
hive/
├── packages/core/src/
│   ├── agents/
│   │   ├── core/
│   │   │   ├── Agent.ts              # 唯一入口
│   │   │   ├── AgentContext.ts        # 共享上下文 + Hook 注册表
│   │   │   ├── agents.ts             # Worker 定义（explore/plan/general/schedule）
│   │   │   └── runner.ts             # AgentRunner — Worker 执行引擎
│   │   └── capabilities/
│   │       ├── CoordinatorCapability.ts  # LLM 循环 + Worker 编排
│   │       ├── ProviderCapability.ts     # Provider 注册 + AI SDK
│   │       ├── SkillCapability.ts        # 技能加载 + 匹配
│   │       ├── SessionCapability.ts      # SQLite 持久化
│   │       ├── TimeoutCapability.ts      # 心跳 + 卡死检测
│   │       └── ScheduleCapability.ts     # 定时任务
│   ├── providers/
│   │   ├── ProviderManager.ts        # Provider 注册表
│   │   └── adapters/                 # Anthropic, OpenAI, Google, OpenAI-compatible
│   ├── tools/built-in/               # 14 个内置工具（bash, file, glob, grep, web 等）
│   ├── skills/                       # SkillLoader, SkillMatcher, SkillRegistry
│   ├── hooks/                        # HookRegistry + 类型定义
│   └── index.ts                      # 公共 API 导出
├── apps/server/src/
│   ├── main.ts                       # 服务入口
│   └── gateway/                      # Hono HTTP + WebSocket 路由
└── apps/desktop/                     # Tauri 2 桌面应用（React 19）
```

</details>

---

## 开发

| 命令 | 说明 |
|:-----|:-----|
| `pnpm install` | 安装依赖 |
| `pnpm -r build` | 构建所有包 |
| `pnpm test` | 运行测试（1,337 个用例） |
| `pnpm test:e2e` | E2E 测试（需 API Key） |
| `pnpm --filter @bundy-lmw/hive-server start` | 启动 HTTP 服务 |

---

## 常见问题

<details>
<summary><b>Coordinator-Worker 模式是怎么运作的？</b></summary>

`Agent.dispatch()` 进入 Coordinator 的 LLM 循环。Coordinator 拥有 3 个 coordinator 工具：`agent`（启动 Worker）、`task-stop`（取消 Worker）、`send-message`（推送消息到渠道）。对于复杂任务，Coordinator 会自主启动 explore → plan → general Worker。对于简单查询，它直接响应，不启动任何 Worker。

</details>

<details>
<summary><b>如何集成到现有项目？</b></summary>

安装 `@bundy-lmw/hive-core`，设置环境变量或传入 `AgentInitOptions`，调用 `agent.dispatch()`。如需 HTTP 封装，使用 `@bundy-lmw/hive-server`。

</details>

<details>
<summary><b>如何添加自定义渠道？</b></summary>

实现 Plugin 接口，发布为 npm 包，通过 Webhook 路由注册。参考 `@bundy-lmw/hive-plugin-feishu` 的实现。

</details>

<details>
<summary><b>可以同时用多个 Provider 吗？</b></summary>

可以。配置多个 Provider 后，运行时用 `agent.useProvider('name')` 切换。也可以按任务指定：`dispatch(task, { modelId: 'deepseek-chat' })`。

</details>

---

## 许可证

[MIT](LICENSE)

---

<p align="center">
  <a href="https://github.com/1695365384/hive/issues">Issues</a> &middot;
  <a href="https://github.com/1695365384/hive/pulls">Pull Requests</a> &middot;
  <a href="https://github.com/1695365384/hive/blob/main/CONTRIBUTING.md">Contributing</a>
</p>
