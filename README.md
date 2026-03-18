# Claude Agent Service

面向 **C 端应用** 的 Claude Agent 服务 SDK。

**核心设计：借助生态力量，不重复造轮子**

```
┌─────────────────────────────────────────────────────────┐
│                  你的 C 端应用                           │
├─────────────────────────────────────────────────────────┤
│              本 SDK (claude-agent-service)              │
├───────────────────────┬─────────────────────────────────┤
│   Claude Agent SDK    │     统一提供商管理器             │
│   (Agent 能力)        │   (内置预设 + CC-Switch)         │
│   Anthropic 官方      │                                 │
├───────────────────────┴─────────────────────────────────┤
│  Claude │ GLM │ DeepSeek │ Qwen │ OpenAI │ 50+ 更多... │
└─────────────────────────────────────────────────────────┘
```

## 特性

- 🚀 **开箱即用** - 内置主流 LLM 提供商预设，无需额外配置
- 🔄 **双模式切换** - 支持 CC-Switch 集成或直接使用预设
- 🇨🇳 **国产友好** - 原生支持 GLM、DeepSeek、Qwen、Kimi 等
- 🌍 **全球覆盖** - 支持 OpenAI、OpenRouter、Together AI 等
- 🤖 **主 Agent 系统** - 统一入口，管理所有子 Agent 和功能
- 🔧 **子 Agent 系统** - Claude Code 风格的 Explore / Plan / General
- 🔄 **工作流引擎** - 三阶段循环：收集上下文 → 采取行动 → 验证结果
- 🎯 **技能系统** - 模块化技能管理，支持自定义扩展
- 🌐 **HTTP 服务** - 内置 REST API，支持流式响应
- 📝 **通用任务** - 不只是写代码，支持研究、分析、写作、数据处理等
- 💾 **持久化存储** - 用户偏好、跨会话记忆
- 🛠️ **MCP 扩展** - 支持 Model Context Protocol
- ✅ **完整测试** - 153 个测试用例，核心模块高覆盖率

## 快速开始

### 本地调试 CLI（快速测试 Agent）

```bash
npm run cli
```

启动后可直接输入问题进行对话，支持以下模式：

- **workflow 模式**（默认）：直接输入任务，观察 phase/tool 输出，验证 agent loop 与子 agent
- **chat 模式**：简单对话交互
- **explore/plan/general 模式**：测试特定子 Agent

CLI 命令：
- `/mode chat|explore|plan|general|workflow` - 切换模式
- `/loop <task>` - 执行工作流任务
- `/provider <name> [apiKey]` - 切换提供商
- `/cwd <path>` - 设置工作目录
- `/thoroughness quick|medium|very-thorough` - 设置彻底程度
- `/stream on|off` - 开关流式输出
- `/state` - 查看当前状态
- `/skills` - 列出所有技能
- `/help` - 显示帮助
- `/exit` - 退出

### 启动 HTTP 服务

```bash
npm run server
```

服务运行在 `http://localhost:3000`，提供以下 API：

- `POST /chat` - 简单对话
- `POST /chat/stream` - 流式对话（Server-Sent Events）
- `GET /health` - 健康检查
- `GET /providers` - 列出所有提供商
- `GET /skills` - 列出所有技能

示例：
```bash
# 简单对话
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "你好，请介绍一下你自己"}'

# 流式对话
curl -X POST http://localhost:3000/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt": "写一个故事"}'
```

### 1. 安装

```bash
# 安装本 SDK
npm install claude-agent-service

# 可选：安装 CC-Switch（用于管理多个提供商）
brew tap farion1231/ccswitch
brew install --cask cc-switch
```

### 2. 使用内置预设（推荐新手）

```typescript
import { UnifiedAgentService, ask } from 'claude-agent-service';

// 方式 1: 快速对话
const answer = await ask('你好', {
  provider: 'deepseek',
  apiKey: 'your-deepseek-api-key',
});

// 方式 2: 创建 Agent 实例
const agent = new UnifiedAgentService();

// 切换到 DeepSeek
agent.useProvider('deepseek', 'your-api-key');
const response = await agent.chat('分析这个代码');

// 切换到 GLM
agent.useProvider('glm', 'your-glm-api-key');
const response2 = await agent.chat('你好，请介绍一下你自己');
```

### 3. 使用 CC-Switch（推荐进阶用户）

```typescript
import { UnifiedAgentService } from 'claude-agent-service';

const agent = new UnifiedAgentService();

// 检查 CC-Switch 是否已安装
if (agent.isCCSwitchInstalled()) {
  // 使用 CC-Switch 当前激活的提供商
  const response = await agent.chat('你好');

  // 切换提供商（配置在 CC-Switch 中）
  agent.useProvider('openrouter');
  const response2 = await agent.chat('Hello');
}
```

### 4. 流式对话

```typescript
const agent = new UnifiedAgentService();

await agent.chatStream('写一个故事', {
  provider: 'qwen',
  apiKey: 'your-qwen-api-key',
  onText: (text) => console.log(text),
  onTool: (name) => console.log(`使用工具: ${name}`),
});
```

## 支持的提供商

### 国产 LLM

| 提供商 | 预设名称 | 模型示例 | 特点 |
|--------|----------|----------|------|
| **GLM (智谱)** | `glm` | glm-5, glm-4.7 | 长文本、多模态 |
| **Qwen (通义千问)** | `qwen` | qwen3-max, qwen-plus | 阿里云、长上下文 |
| **DeepSeek** | `deepseek` | deepseek-chat, deepseek-reasoner | 高性价比 |
| **Kimi (月之暗面)** | `kimi` | moonshot-v1-128k | 超长上下文 |
| **ERNIE (文心一言)** | `ernie` | ernie-4.0-8k | 百度 |
| **Spark (讯飞星火)** | `spark` | spark-v4.0 | 讯飞 |

### OpenAI 系列

| 提供商 | 预设名称 | 模型示例 |
|--------|----------|----------|
| **OpenAI** | `openai` | gpt-4o, gpt-4-turbo |
| **Azure OpenAI** | `azure_openai` | gpt-4o, gpt-35-turbo |

### 聚合网关

| 提供商 | 预设名称 | 特点 |
|--------|----------|------|
| **OpenRouter** | `openrouter` | 100+ 模型聚合 |
| **LiteLLM** | `litellm` | 开源自部署网关 |
| **Together AI** | `together` | 开源模型推理 |

### 官方

| 提供商 | 预设名称 | 模型示例 |
|--------|----------|----------|
| **Anthropic** | `anthropic` | claude-opus-4-6, claude-sonnet-4-6 |

## API 参考

### UnifiedAgentService

```typescript
class UnifiedAgentService {
  // 获取当前提供商
  get currentProvider(): CCProvider | null;

  // 列出所有提供商（合并 CC-Switch + 内置预设）
  listProviders(): CCProvider[];

  // 列出所有内置预设
  listPresets(): Array<{ id: string; name: string; description?: string }>;

  // 按类别列出预设
  listPresetsByCategory(): Record<string, Array<{ id: string; name: string }>>;

  // 切换提供商
  useProvider(name: string, apiKey?: string): boolean;

  // 检查 CC-Switch 是否安装
  isCCSwitchInstalled(): boolean;

  // 简单对话
  chat(prompt: string, options?: AgentChatOptions): Promise<string>;

  // 流式对话
  chatStream(prompt: string, options?: AgentChatOptions): Promise<void>;
}
```

### AgentChatOptions

```typescript
interface AgentChatOptions {
  provider?: string;      // 提供商名称（预设或 CC-Switch 配置）
  apiKey?: string;        // API Key（使用预设时需要）
  model?: string;         // 指定模型
  cwd?: string;           // 工作目录
  tools?: string[];       // 允许的工具
  maxTurns?: number;      // 最大轮次
  systemPrompt?: string;  // 系统提示
  onText?: (text: string) => void;       // 文本回调
  onTool?: (name: string) => void;       // 工具回调
  onError?: (error: Error) => void;      // 错误回调
}
```

## 便捷函数

```typescript
// 快速对话
import { ask } from 'claude-agent-service';
const answer = await ask('你好', { provider: 'deepseek', apiKey: '...' });

// 创建 Agent
import { createAgent } from 'claude-agent-service';
const agent = createAgent();

// 快速使用预设
import { usePreset } from 'claude-agent-service';
await usePreset('glm', 'your-api-key');
```

## 三代理系统（Claude Code 风格）

Claude Code 内置三个核心代理，可以处理任何任务：

```
┌─────────────────────────────────────────────────────────┐
│                    主 Agent                              │
├─────────────────────────────────────────────────────────┤
│  根据任务类型，自动委托给合适的子代理                     │
└───────────────┬─────────────────────────────────────────┘
                │
    ┌───────────┼───────────┐
    ▼           ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐
│Explore │ │  Plan  │ │General │
│ 快速   │ │ 研究   │ │ 通用   │
└────────┘ └────────┘ └────────┘
│Haiku   │ │继承    │ │继承    │
│只读    │ │只读    │ │所有工具│
└────────┘ └────────┘ └────────┘
```

### 使用示例

```typescript
import { createAgent, explore, plan, general } from 'claude-agent-service';

const agent = createAgent();

// Explore - 快速搜索代码库（Haiku 模型）
await agent.explore('查找所有 API 路由', 'quick');      // 快速
await agent.explore('分析项目结构', 'medium');          // 平衡
await agent.explore('全面分析认证模块', 'very-thorough'); // 彻底

// Plan - 研究代码库用于规划
await agent.plan('研究认证模块的实现');

// General - 通用任务（所有工具）
await agent.general('重构代码并添加测试');

// 便捷函数
await explore('搜索代码', 'quick');
await plan('研究实现');
await general('执行任务');
```

### 三代理对比

| Agent | 模型 | 工具 | 用途 |
|-------|------|------|------|
| **Explore** | Haiku（快速） | 只读 | 文件发现、代码搜索、探索 |
| **Plan** | 继承 | 只读 | 计划研究、收集上下文 |
| **General** | 继承 | 全部 | 复杂任务、代码修改 |

## 三阶段工作流

Claude Code 的工作流是三阶段循环：

```
收集上下文 → 采取行动 → 验证结果
     ↑                       │
     └───────────────────────┘
```

这三个阶段相互融合，Claude 始终使用工具来完成工作。

### 使用示例

```typescript
import { runWorkflow, codeTask, researchTask, WorkflowEngine } from 'claude-agent-service';

// 基础工作流
await runWorkflow('创建一个 README.md', {
  cwd: process.cwd(),
  onPhaseChange: (phase, desc) => {
    console.log(`[${phase}] ${desc}`);
  },
});

// 代码任务
await codeTask('实现一个工具函数库');

// 研究任务
await researchTask('分析这个项目的架构');

// 完整工作流控制
const engine = new WorkflowEngine();
await engine.execute({
  task: '创建测试文件',
  cwd: './src',
  verifyCondition: '确保测试可以运行',
  onPhaseChange: (phase) => console.log(`Phase: ${phase}`),
  onTool: (tool) => console.log(`Tool: ${tool}`),
});
```

### 任务类型

SDK 不只是写代码，支持多种任务类型：

| 类型 | 描述 | 工具 |
|------|------|------|
| `code` | 代码任务 | Read, Write, Edit, Bash, Glob, Grep |
| `research` | 研究任务 | Read, Glob, Grep, WebSearch, WebFetch |
| `analysis` | 分析任务 | Read, Bash, Glob, Grep |
| `writing` | 写作任务 | Read, Write, Edit, WebSearch |
| `data` | 数据处理 | Read, Write, Edit, Bash, Glob |
| `automation` | 自动化任务 | Read, Write, Edit, Bash, Glob, Grep |
| `custom` | 自定义任务 | 所有工具 |

## 环境变量配置

可以通过环境变量预配置 API Key，然后直接使用提供商名称：

```bash
# .env 文件
GLM_API_KEY=your_glm_key
DEEPSEEK_API_KEY=your_deepseek_key
QWEN_API_KEY=your_qwen_key
OPENAI_API_KEY=your_openai_key
OPENROUTER_API_KEY=your_openrouter_key
```

```typescript
// 然后在代码中直接使用
agent.useProvider('glm');      // 自动从 GLM_API_KEY 读取
agent.useProvider('deepseek'); // 自动从 DEEPSEEK_API_KEY 读取
```

## CC-Switch 集成

CC-Switch 是一个跨平台的桌面应用，用于管理多个 LLM 提供商配置。

### 直接读取配置

```typescript
import { CCSwitchReader } from 'claude-agent-service';

const reader = new CCSwitchReader();

// 获取当前激活的提供商
const provider = reader.getActiveProvider();

// 应用到环境变量
reader.applyProvider(provider);

// 获取 MCP 服务器配置
const mcpServers = reader.getMcpServersForAgent();
```

### CC-Switch vs 内置预设

| 场景 | 推荐方案 |
|------|----------|
| 只用一个提供商 | 内置预设 |
| 需要频繁切换 | CC-Switch |
| 团队共享配置 | CC-Switch |
| 不想安装额外软件 | 内置预设 |
| 需要自定义配置 | CC-Switch |

## 技能系统

技能系统提供模块化的功能扩展，支持通过 YAML frontmatter 配置技能元数据。

### 技能结构

```
skills/
├── code-review/
│   └── SKILL.md              # 代码审查技能
└── api-testing/
    └── SKILL.md              # API 测试技能
```

### 创建技能

1. 在 `skills/` 目录创建技能文件夹
2. 创建 `SKILL.md` 文件，包含 frontmatter 和说明：

```markdown
---
name: My Skill
description: This skill should be used when...
version: 1.0.0
author: Your Name
tags:
  - category
  - another-category
---

# My Skill

## Purpose

Describe what this skill does...

## Process

1. Step 1
2. Step 2
...

## Output Format

Describe expected output format...
```

### 使用技能

```typescript
import { initializeSkills } from 'claude-agent-service';

// 初始化技能系统
const registry = await initializeSkills();

// 匹配技能
const match = registry.match('帮我 review 代码');
if (match) {
  console.log(`Matched skill: ${match.skill.metadata.name}`);
}

// 列出所有技能
const skills = registry.getAllMetadata();
```

### 内置技能

- **Code Review** - 代码审查和质量分析
- **API Testing** - API 接口测试和验证

## 测试

项目包含完整的测试套件：

```bash
# 运行测试
npm test

# 监视模式
npm run test:watch

# 覆盖率报告
npm run test:coverage
```

**测试状态**：
- ✅ 153 个测试全部通过
- 📊 核心模块高覆盖率
  - skills: 82.28%
  - agents/core: 55.39%
  - agents/prompts: 73.91%

## 目录结构

```
src/
├── index.ts                    # SDK 入口
├── server.ts                   # HTTP 服务
├── cli.ts                      # CLI 工具
│
├── agents/                     # Agent 系统
│   ├── core/                   # 核心 Agent 实现
│   │   ├── Agent.ts           # 主 Agent 类
│   │   ├── AgentContext.ts    # Agent 上下文
│   │   ├── agents.ts          # 内置 Agent 配置
│   │   ├── runner.ts          # Agent 运行器
│   │   └── task.ts            # Task 系统
│   ├── capabilities/           # Agent 能力模块
│   │   ├── ChatCapability.ts  # 对话能力
│   │   ├── SkillCapability.ts # 技能能力
│   │   ├── ProviderCapability.ts # 提供商能力
│   │   ├── SubAgentCapability.ts # 子 Agent 能力
│   │   └── WorkflowCapability.ts # 工作流能力
│   ├── prompts/                # Prompt 模板系统
│   └── registry/               # Agent 注册表
│
├── providers/                  # 提供商管理
│   ├── cc-switch-provider.ts  # CC-Switch + 统一管理器
│   ├── config-loader.ts       # 配置加载器
│   ├── presets.ts             # 内置提供商预设
│   └── types.ts               # 类型定义
│
├── skills/                     # 技能系统
│   ├── loader.ts              # 技能加载器
│   ├── matcher.ts             # 技能匹配器
│   ├── registry.ts            # 技能注册表
│   └── types.ts               # 类型定义
│
├── services/                   # 服务层
│   └── preferences.ts         # 偏好存储
│
└── tools/                      # MCP 工具
    ├── preference-tools.ts    # 偏好 MCP 工具
    └── memory-tools.ts        # 记忆 MCP 工具

skills/                         # 技能定义
├── code-review/
│   └── SKILL.md
└── api-testing/
    └── SKILL.md

tests/                          # 测试文件
├── unit/                       # 单元测试
├── integration/                # 集成测试
└── skills.test.ts              # 技能系统测试
```

## 高级功能

### 自定义 Agent

```typescript
import { AgentRegistry, getAgentConfig } from 'claude-agent-service';

// 创建自定义 Agent
const registry = new AgentRegistry();
registry.register({
  name: 'my-agent',
  description: 'My custom agent',
  systemPrompt: 'You are a specialized agent...',
  model: 'claude-sonnet-4-6',
  tools: ['read', 'write'],
});

// 使用自定义 Agent
const config = getAgentConfig('my-agent');
```

### 工作流控制

```typescript
import { WorkflowEngine } from 'claude-agent-service';

const engine = new WorkflowEngine();
await engine.execute({
  task: '创建测试文件',
  cwd: './src',
  verifyCondition: '确保测试可以运行',
  onPhaseChange: (phase) => console.log(`Phase: ${phase}`),
  onTool: (tool) => console.log(`Tool: ${tool}`),
});
```

### Task 并行执行

```typescript
import { runParallel } from 'claude-agent-service';

// 并行执行多个任务
const results = await runParallel([
  { type: 'explore', prompt: '分析模块 A' },
  { type: 'explore', prompt: '分析模块 B' },
  { type: 'explore', prompt: '分析模块 C' },
]);
```

## 常见问题

### Q: 内置预设和 CC-Switch 有什么区别？

A: 内置预设是硬编码在 SDK 中的配置，开箱即用。CC-Switch 是一个独立的桌面应用，提供更多自定义选项和 50+ 提供商预设。

### Q: 如何添加新的提供商？

A: 有两种方式：
1. 在 CC-Switch 中添加自定义提供商
2. 在 `presets.ts` 中添加预设并提交 PR

### Q: 如何创建自定义技能？

A: 在 `skills/` 目录创建文件夹和 `SKILL.md` 文件，使用 YAML frontmatter 定义元数据。系统会自动加载和匹配技能。

### Q: 支持哪些模型？

A: SDK 通过提供商支持几乎所有主流模型。具体支持的模型取决于各提供商。

### Q: 如何处理 API Key？

A: 推荐使用环境变量存储 API Key，不要硬编码在代码中。

### Q: 如何在生产环境部署？

A: 可以使用内置的 HTTP 服务器，或直接在应用中嵌入 SDK：

```typescript
import { Agent } from 'claude-agent-service';

const agent = new Agent();
app.post('/api/chat', async (req, res) => {
  const response = await agent.chat(req.body.prompt);
  res.json({ response });
});
```

## 开发

### 构建

```bash
npm run build
```

### 监视模式

```bash
npm run dev
```

### 运行测试

```bash
npm test
npm run test:watch
npm run test:coverage
```

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！

## 相关项目

- [CC-Switch](https://github.com/farion1231/ccswitch) - 跨平台 LLM 提供商管理工具
- [Anthropic Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) - 官方 Agent SDK

## 许可证

MIT
