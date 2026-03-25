<div align="center">
  <img src="logo.svg" alt="Hive Logo" width="140" height="140">

  <h1>Hive - Claude Agent Service</h1>

  <p><strong>面向 C 端应用的 Claude Agent 服务 SDK</strong></p>

  <p>
    <em>借助生态力量，不重复造轮子</em>
  </p>

  <p>
    <a href="#快速开始">快速开始</a> •
    <a href="#特性">特性</a> •
    <a href="#api-参考">API</a> •
    <a href="#常见问题">FAQ</a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/Node.js-18+-green" alt="Node.js">
    <img src="https://img.shields.io/badge/TypeScript-5.0+-blue" alt="TypeScript">
    <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
  </p>
</div>

---

## 特性

| | |
|:-:|:-|
| 🚀 **开箱即用** | 内置主流 LLM 提供商预设，无需额外配置 |
| 🔄 **外部配置** | 支持外部传入配置，由应用层管理 |
| 🇨🇳 **国产友好** | 原生支持 GLM、DeepSeek、Qwen、Kimi 等 |
| 🌍 **全球覆盖** | 支持 OpenAI、OpenRouter、Together AI 等 |
| 🤖 **主 Agent 系统** | 统一入口，管理所有子 Agent 和功能 |
| 🔧 **子 Agent 系统** | Claude Code 风格的 Explore / Plan / General |
| 🔄 **工作流引擎** | 三阶段循环：收集上下文 → 采取行动 → 验证结果 |
| 🎯 **技能系统** | 模块化技能管理，支持自定义扩展 |
| 🪝 **Hooks 系统** | 会话生命周期、工具调用等事件钩子 |

---

## 快速开始

### 安装

```bash
npm install claude-agent-service
```

### 5 分钟上手

```typescript
import { ask, createAgent } from 'claude-agent-service';

// 方式 1: 快速对话（使用环境变量）
const answer = await ask('你好');

// 方式 2: 创建 Agent 实例（传入配置）
const agent = createAgent({
  externalConfig: {
    providers: [
      { id: 'glm', baseUrl: '...', apiKey: 'your-api-key', model: 'glm-5' },
      { id: 'deepseek', baseUrl: '...', apiKey: 'your-api-key' },
    ],
    activeProvider: 'glm',
  },
});

// 流式输出
await agent.chatStream('写一个故事', {
  onText: (text) => process.stdout.write(text),
});
```

### 零配置模式（环境变量）

只需设置环境变量，SDK 会自动检测：

```bash
# 设置任意一个 API Key
export GLM_API_KEY=xxx
export DEEPSEEK_API_KEY=xxx
export ANTHROPIC_API_KEY=xxx
export OPENAI_API_KEY=xxx
```

```typescript
// 无需任何配置
const agent = createAgent();
// 自动使用检测到的 Provider
```

### 本地调试 CLI

```bash
npm run cli
```

**命令列表**:

| 命令 | 说明 |
|------|------|
| `/mode chat\|workflow\|explore\|plan\|general` | 切换模式 |
| `/loop <task>` | 执行工作流任务 |
| `/provider <name> [apiKey]` | 切换提供商 |
| `/state` | 查看当前状态 |
| `/skills` | 列出所有技能 |

### 启动 HTTP 服务

```bash
npm run server
```

```bash
# 对话接口
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "你好"}'

# 流式对话
curl -X POST http://localhost:3000/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt": "写一个故事"}'
```

---

## 支持的提供商

### 🇨🇳 国产 LLM

| 提供商 | 预设名称 | 模型示例 | 特点 |
|:------|:---------|:---------|:-----|
| GLM (智谱) | `glm` | glm-5, glm-4.7 | 长文本、多模态 |
| Qwen (通义千问) | `qwen` | qwen3-max, qwen-plus | 阿里云、长上下文 |
| DeepSeek | `deepseek` | deepseek-chat, deepseek-reasoner | 高性价比 |
| Kimi (月之暗面) | `kimi` | moonshot-v1-128k | 超长上下文 |
| ERNIE (文心一言) | `ernie` | ernie-4.0-8k | 百度 |

### 🌍 全球 LLM

| 提供商 | 预设名称 | 模型示例 |
|:------|:---------|:---------|
| Anthropic | `anthropic` | claude-opus-4-6, claude-sonnet-4-6 |
| OpenAI | `openai` | gpt-4o, gpt-4-turbo |
| Azure OpenAI | `azure_openai` | gpt-4o, gpt-35-turbo |
| OpenRouter | `openrouter` | 100+ 模型聚合 |
| Together AI | `together` | 开源模型推理 |

---

## 三代理系统

Claude Code 风格的子代理架构，自动根据任务类型选择合适的代理：

```
                    ┌─────────────────┐
                    │    主 Agent     │
                    │   (统一入口)     │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                 ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │   Explore    │ │     Plan     │ │    General   │
    │    快速      │ │     研究     │ │     通用     │
    ├──────────────┤ ├──────────────┤ ├──────────────┤
    │  Haiku 模型  │ │   继承模型   │ │   继承模型   │
    │   只读工具   │ │   只读工具   │ │   所有工具   │
    └──────────────┘ └──────────────┘ └──────────────┘
```

### 使用示例

```typescript
const agent = createAgent();

// Explore - 快速搜索（Haiku 模型，速度快）
await agent.explore('查找所有 API 路由', 'quick');
await agent.explore('分析项目结构', 'medium');
await agent.explore('全面分析认证模块', 'very-thorough');

// Plan - 研究规划（只读工具）
await agent.plan('研究认证模块的实现方案');

// General - 通用任务（所有工具）
await agent.general('重构代码并添加测试');
```

| Agent | 模型 | 工具 | 典型用途 |
|:------|:-----|:-----|:---------|
| **Explore** | Haiku（快速） | 只读 | 文件发现、代码搜索 |
| **Plan** | 继承 | 只读 | 计划研究、收集上下文 |
| **General** | 继承 | 全部 | 复杂任务、代码修改 |

---

## 三阶段工作流

```
  收集上下文 ──→ 采取行动 ──→ 验证结果
       ▲                          │
       └──────────────────────────┘
```

```typescript
import { runWorkflow, codeTask, researchTask } from 'claude-agent-service';

// 代码任务
await codeTask('实现一个工具函数库');

// 研究任务
await researchTask('分析这个项目的架构');

// 完整工作流控制
await runWorkflow('创建测试文件', {
  cwd: process.cwd(),
  onPhaseChange: (phase, desc) => console.log(`[${phase}] ${desc}`),
});
```

### 任务类型

| 类型 | 描述 | 可用工具 |
|:-----|:-----|:---------|
| `code` | 代码任务 | Read, Write, Edit, Bash, Glob, Grep |
| `research` | 研究任务 | Read, Glob, Grep, WebSearch, WebFetch |
| `analysis` | 分析任务 | Read, Bash, Glob, Grep |
| `writing` | 写作任务 | Read, Write, Edit, WebSearch |
| `data` | 数据处理 | Read, Write, Edit, Bash, Glob |
| `custom` | 自定义任务 | 所有工具 |

---

## Hooks 系统

在关键生命周期节点插入自定义逻辑：

```typescript
const agent = createAgent();

// 会话生命周期
agent.context.hookRegistry.on('session:start', async (ctx) => {
  console.log(`Session started: ${ctx.sessionId}`);
});

// 工具调用拦截
agent.context.hookRegistry.on('tool:before', async (ctx) => {
  if (ctx.toolName === 'Bash') {
    // 安全检查
    return { proceed: true };
  }
});

// 工作流阶段追踪
agent.context.hookRegistry.on('workflow:phase', async (ctx) => {
  console.log(`Phase: ${ctx.phase}`);
});
```

| Hook 类型 | 触发时机 |
|:----------|:---------|
| `session:start` / `session:end` / `session:error` | 会话生命周期 |
| `tool:before` / `tool:after` | 工具调用前后 |
| `capability:init` / `capability:dispose` | 能力生命周期 |
| `workflow:phase` | 工作流阶段变化 |

---

## API 参考

### UnifiedAgentService

```typescript
class UnifiedAgentService {
  // 提供商管理
  get currentProvider(): CCProvider | null;
  listProviders(): CCProvider[];
  useProvider(name: string, apiKey?: string): boolean;

  // 对话
  chat(prompt: string, options?: AgentChatOptions): Promise<string>;
  chatStream(prompt: string, options?: AgentChatOptions): Promise<void>;
}
```

### 便捷函数

```typescript
// 快速对话
await ask('你好', { provider: 'deepseek', apiKey: '...' });

// 创建 Agent
const agent = createAgent();

// 使用预设
await usePreset('glm', 'your-api-key');

// 子代理便捷函数
await explore('搜索代码', 'quick');
await plan('研究实现');
await general('执行任务');
```

---

## 配置

### 环境变量

```bash
# .env
GLM_API_KEY=your_glm_key
DEEPSEEK_API_KEY=your_deepseek_key
QWEN_API_KEY=your_qwen_key
OPENAI_API_KEY=your_openai_key
```

```typescript
// 自动从环境变量读取
agent.useProvider('glm');      // → GLM_API_KEY
agent.useProvider('deepseek'); // → DEEPSEEK_API_KEY
```

### 外部配置

配置由外部应用传入，SDK 只是消费者：

```typescript
import { createAgent, type ExternalConfig } from 'claude-agent-service';

const config: ExternalConfig = {
  providers: [
    {
      id: 'glm',
      name: 'GLM (智谱)',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: 'your-api-key',
      model: 'glm-5',
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      apiKeyEnv: 'DEEPSEEK_API_KEY', // 或从环境变量读取
    },
  ],
  activeProvider: 'glm',
  mcpServers: {
    context7: {
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-context7'],
    },
  },
};

const agent = createAgent({ externalConfig: config });
```

### 配置优先级

| 来源 | 优先级 | 说明 |
|:-----|:-------|:-----|
| 外部配置 | 最高 | 应用传入的 ExternalConfig |
| 环境变量 | 次高 | ${PROVIDER}_API_KEY 约定 |

---

## 技能系统

模块化的功能扩展，通过 YAML frontmatter 定义：

```
skills/
├── code-review/
│   └── SKILL.md
└── api-testing/
    └── SKILL.md
```

```markdown
---
name: Code Review
description: Used when user asks to review code...
tags:
  - code-quality
---

# Code Review Skill
...
```

```typescript
import { initializeSkills } from 'claude-agent-service';

const registry = await initializeSkills();
const match = registry.match('帮我 review 代码');
```

---

## 目录结构

```
src/
├── agents/
│   ├── core/           # Agent 核心实现
│   ├── capabilities/   # 能力模块（委托模式）
│   ├── prompts/        # Prompt 模板系统
│   └── registry/       # Agent 注册表
├── providers/
│   ├── sources/        # 配置来源（环境变量）
│   ├── presets/        # 内置预设
│   └── models/         # 模型规格
├── skills/             # 技能系统
├── hooks/              # Hooks 系统
├── services/           # 服务层
└── tools/              # MCP 工具

skills/                 # 技能定义文件
tests/                  # 测试（unit, integration, e2e）
```

---

## 测试

```bash
# 运行所有测试
npm test

# 监视模式
npm run test:watch

# 覆盖率报告
npm run test:coverage

# E2E 测试（真实 API）
npm run test:e2e
```

---

## 常见问题

<details>
<summary><b>如何配置多个提供商？</b></summary>
<br>

通过外部配置传入：

```typescript
const agent = createAgent({
  externalConfig: {
    providers: [
      { id: 'glm', baseUrl: '...', apiKey: '...' },
      { id: 'deepseek', baseUrl: '...', apiKey: '...' },
    ],
    activeProvider: 'glm',
  },
});
```

</details>

<details>
<summary><b>如何添加新的提供商？</b></summary>
<br>

1. 在外部配置中添加自定义提供商
2. 或在 `presets/` 中添加预设并提交 PR

</details>

<details>
<summary><b>如何创建自定义技能？</b></summary>
<br>

在 `skills/` 目录创建文件夹和 `SKILL.md` 文件，使用 YAML frontmatter 定义元数据。系统会自动加载和匹配技能。

</details>

<details>
<summary><b>如何处理 API Key？</b></summary>
<br>

推荐使用环境变量存储 API Key，不要硬编码在代码中。

</details>

<details>
<summary><b>如何在生产环境部署？</b></summary>
<br>

```typescript
import { Agent } from 'claude-agent-service';

const agent = new Agent();

// Express 示例
app.post('/api/chat', async (req, res) => {
  const response = await agent.chat(req.body.prompt);
  res.json({ response });
});
```

</details>

---

## 开发

```bash
# 构建
npm run build

# 监视模式
npm run dev

# 运行测试
npm test
```

---

## 相关项目

| 项目 | 描述 |
|:-----|:-----|
| [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) | Anthropic 官方 Agent SDK |

---

## 许可证

[MIT](LICENSE)

---

<p align="center">
  欢迎提交 <a href="https://github.com/farion1231/hive/issues">Issue</a> 和 <a href="https://github.com/farion1231/hive/pulls">Pull Request</a>！
</p>
