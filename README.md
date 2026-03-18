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
- 🤖 **三代理系统** - Claude Code 风格的 Explore / Plan / General
- 🔄 **三阶段工作流** - 收集上下文 → 采取行动 → 验证结果
- 📝 **通用任务** - 不只是写代码，支持研究、分析、写作、数据处理等
- 💾 **持久化存储** - 用户偏好、跨会话记忆
- 🛠️ **MCP 扩展** - 支持 Model Context Protocol

## 快速开始

### 本地调试 CLI（快速测试 Agent）

```bash
npm run cli
```

启动后可直接输入问题进行对话，也支持命令：

默认模式是 `workflow`，直接输入任务即可观察 phase/tool 输出，便于验证 agent loop 与子 agent 是否正常。

- `/mode chat|explore|plan|general|workflow`
- `/loop <task>`
- `/provider <name> [apiKey]`
- `/cwd <path>`
- `/thoroughness quick|medium|very-thorough`
- `/stream on|off`
- `/state`
- `/help`
- `/exit`

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

## 目录结构

```
src/
├── index.ts                    # SDK 入口
├── core.ts                     # 简化 API
├── server.ts                   # HTTP 服务
│
├── providers/                  # 提供商管理
│   ├── index.ts               # Agent 服务
│   ├── cc-switch-provider.ts  # CC-Switch + 统一管理器
│   └── presets.ts             # 内置提供商预设
│
├── services/
│   ├── agent.ts               # Agent 服务
│   └── preferences.ts         # 偏好存储
│
├── tools/
│   ├── preference-tools.ts    # 偏好 MCP 工具
│   └── memory-tools.ts        # 记忆 MCP 工具
│
└── examples/
    └── provider-usage.ts      # 使用示例
```

## 常见问题

### Q: 内置预设和 CC-Switch 有什么区别？

A: 内置预设是硬编码在 SDK 中的配置，开箱即用。CC-Switch 是一个独立的桌面应用，提供更多自定义选项和 50+ 提供商预设。

### Q: 如何添加新的提供商？

A: 有两种方式：
1. 在 CC-Switch 中添加自定义提供商
2. 在 `presets.ts` 中添加预设并提交 PR

### Q: 支持哪些模型？

A: SDK 通过提供商支持几乎所有主流模型。具体支持的模型取决于各提供商。

### Q: 如何处理 API Key？

A: 推荐使用环境变量存储 API Key，不要硬编码在代码中。

## 许可证

MIT
