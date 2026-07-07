# Vertical Pack 系统

> 让 Hive 可以方便地扩展任意垂直业务场景，每个场景打包为一个自包含的扩展包，多个包可共存且互不干扰。

## 目录

- [概念](#概念)
- [快速开始](#快速开始)
- [扩展点详解](#扩展点详解)
  - [1. 工具 (tools)](#1-工具-tools)
  - [2. 子 Agent (agents)](#2-子-agent-agents)
  - [3. 技能 (skills)](#3-技能-skills)
  - [4. 能力模块 (capabilities)](#4-能力模块-capabilities)
  - [5. 生命周期钩子 (hooks)](#5-生命周期钩子-hooks)
  - [6. 初始化与销毁 (setup / dispose)](#6-初始化与销毁-setup--dispose)
- [运行时隔离](#运行时隔离)
  - [冲突检测](#冲突检测)
  - [命名空间模式](#命名空间模式)
  - [卸载 pack](#卸载-pack)
- [依赖管理](#依赖管理)
- [CLI 脚手架](#cli-脚手架)
- [分发与发布](#分发与发布)
- [最佳实践](#最佳实践)

---

## 概念

Vertical Pack 是一个把 **垂直业务场景所需的所有 Hive 扩展点** 打包成一个声明式清单的类型，由 PackManager 统一编排注册到 Agent。

一个 pack 包含什么（都是可选的）：

| 扩展点 | 职责 | 典型场景 |
|--------|------|----------|
| `tools` | 领域工具（AI SDK Tool） | 查法规、查病例、价格计算 |
| `agents` | 领域子 Agent（专属角色） | 法务审核员、医疗诊断助手 |
| `skills` | 技能知识（SKILL.md） | 合同条款判断、影像判读 |
| `capabilities` | 有状态后台服务 | 知识库连接、缓存、外部 API 客户端 |
| `hooks` | 生命周期拦截 | 审计日志、合规拦截、数据脱敏 |
| `setup/dispose` | 初始化和销毁 | 预热缓存、断开连接 |

**设计原则：**

- **声明式**：pack 作者只描述「有什么」，不描述「怎么注册」
- **可组合**：多个 pack 可挂到同一个 Agent，按依赖拓扑排序初始化
- **隔离**：pack 之间不会因命名冲突相互覆盖（见[运行时隔离](#运行时隔离)）
- **可分发**：一个 pack = 一个 npm 包，`agent.use(new SomePack())`
- **零框架入侵**：pack 不依赖 Hive 内部 API，只依赖公开接口类型

---

## 快速开始

### 脚手架生成

```bash
# 安装 hive-core（已安装可跳过）
npm install @bundy-lmw/hive-core

# 用脚手架生成 pack 骨架
npx hive-pack init my-legal-pack --description "法务场景扩展包"
```

生成的目录结构：

```
my-legal-pack/
├── src/
│   ├── index.ts           # Pack 主文件（实现 VerticalPack）
│   └── tools/
│       └── example.ts     # 示例工具
├── skills/
│   └── README.md          # 技能存放说明
├── package.json
├── tsconfig.json
└── README.md
```

### 编写业务逻辑

编辑 `src/index.ts`，按需取消注释你要用的扩展点：

```typescript
export class MyLegalPack implements VerticalPack {
  readonly id = 'my-legal-pack';
  readonly name = '法务场景扩展包';
  readonly version = '0.1.0';
  readonly dependencies: string[] = [];

  // 注册领域工具
  tools = [
    { name: 'query-law', tool: createQueryLawTool() },
  ];

  // 注册子 Agent
  agents = [
    {
      name: 'legal-reviewer',
      config: {
        type: 'custom' as const,
        description: '法务合同审核员',
        tools: ['file', 'glob', 'grep', 'query-law'],
        maxTurns: 15,
      },
    },
  ];
}
```

### 挂载到 Agent

```typescript
import { Agent } from '@bundy-lmw/hive-core';
import { MyLegalPack } from '@hive-pack/my-legal-pack';

const agent = new Agent();
agent.use(new MyLegalPack());
await agent.initialize();

// 现在 dispatch 时，Agent 的 Coordinator 可以看到 pack 注册的工具和子 Agent
const result = await agent.dispatch('审核这份合同');
```

### 多个 pack 共存

```typescript
agent
  .use(new LegalPack())     // 法务包
  .use(new MedicalPack());  // 医疗包
await agent.initialize();
```

---

## 扩展点详解

### 1. 工具 (tools)

**类型**: `ToolDefinition[]` (AI SDK `Tool`)

工具注册到 `ToolRegistry`，对所有 Agent 类型（explore/plan/general/custom）可见。

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const queryLawTool = tool({
  description: '查询法律法规条文',
  inputSchema: z.object({
    keyword: z.string().describe('关键词'),
    limit: z.number().optional().describe('返回条数'),
  }),
  execute: async ({ keyword, limit }) => {
    // 调用你的领域 API
    return searchLaw(keyword, limit);
  },
});

// pack 中声明
tools = [
  { name: 'query-law', tool: queryLawTool },
];
```

**注意**：工具名全局唯一。多个 pack 若注册同名工具，非 namespaced 模式下会抛出 `PackConflictError`。

### 2. 子 Agent (agents)

**类型**: `SubAgentDefinition[]`

注册自定义 Agent 类型，可以指定该 agent 可用的工具白名单，Coordinator 可以像调用内置 agent 一样调用它。

```typescript
agents = [
  {
    name: 'legal-reviewer',   // agent 类型标识
    config: {
      type: 'custom' as const, // 固定为 'custom'
      description: '法务合同审核员（仅审核条款，不修改）',
      tools: ['file', 'glob', 'grep', 'query-law'],
      maxTurns: 15,
      model: 'glm-4-flash',  // 可选：指定模型
    },
  },
];
```

**工具白名单**：
- 声明的 tools 列表会严格作为该 agent 的可用工具，不会 fallback 到 general
- 列表中可以引用 pack 自己注册的自定义工具（如 `query-law`），也可以引用内置工具（如 `file`、`glob`、`grep`）
- 未在列表中声明的工具，该 agent 无权调用

Coordinator 在规划任务时会自动选择合适的子 Agent。你也可以在 `DispatchOptions` 中手动指定：

```typescript
await agent.dispatch('审核这份合同', {
  modelId: 'legal-reviewer', // 指定 agent 类型
});
```

### 3. 技能 (skills)

**类型**: `SkillDefinition[]`

技能是 Markdown 文件（含 YAML frontmatter），定义在 `skills/` 目录下。Agent 匹配到对应任务时会自动注入技能指令。

```typescript
// skills/contract-review/SKILL.md
// ---
// name: contract-review
// description: 合同条款风险判断
// ---
// ## 合同审核要点
// 1. 检查违约金比例是否超过 30%
// 2. 检查管辖法院约定是否明确
// ...

// pack 中加载
import { loadSkill } from '@bundy-lmw/hive-core';

skills = [
  { skill: await loadSkill('./skills/contract-review/SKILL.md') },
];
```

### 4. 能力模块 (capabilities)

**类型**: `AgentCapability[]`

Capability 是有状态的后台服务——知识库连接、外部 API 客户端、缓存等。它实现 `AgentCapability` 接口，有完整的生命周期（`initialize` → `initializeAsync` → `dispose`）。

```typescript
import type { AgentCapability } from '@bundy-lmw/hive-core';

class LawKnowledgeBase implements AgentCapability {
  readonly name = 'law-knowledge-base';
  private client: SomeDBClient;

  initialize(context: AgentContext) {
    this.client = new SomeDBClient({ path: './laws.db' });
  }

  async initializeAsync(context: AgentContext) {
    await this.client.connect();
  }

  dispose() {
    this.client.close();
  }
}

// pack 中声明
capabilities = [new LawKnowledgeBase()];
```

**时序**：
1. PackManager 注册 capability 到 AgentContext（最早注册）
2. Agent.initialize() 调用 `initializeAll()`，遍历所有 capability 执行 `initialize()` → `initializeAsync()`
3. Agent.dispose() 时遍历所有 capability 执行 `dispose()`

### 5. 生命周期钩子 (hooks)

**类型**: `HookRegistration[]`

Hook 可以拦截或监听系统事件，支持按优先级排序。

```typescript
hooks = [
  {
    event: 'tool:before',     // 工具执行前
    handler: async (ctx) => {
      console.log(`[审计] 工具调用: ${ctx.toolName}`);
      return { proceed: true }; // 或 { proceed: false, error: '...' } 拦截
    },
    options: { priority: 'high' },
  },
  {
    event: 'session:start',   // 会话开始
    handler: async (ctx) => { /* ... */ },
  },
];
```

可用 Hook 事件列表见 Hive 主文档的 Hook System 章节。

### 6. 初始化与销毁 (setup / dispose)

**`setup(ctx)`** — 在 pack 的所有扩展点注册后、Agent 启动前调用：

```typescript
async setup({ agent, context, config }) {
  // agent: Agent 实例（可调用 agent.dispatch 等）
  // context: AgentContext（可访问 providerManager、hookRegistry 等）
  // config: 外部配置对象（agent.use(pack) 时传入）

  const apiKey = config.apiKey;
  this.client = new SomeClient(apiKey);
  await this.client.connect();
}
```

**`dispose()`** — Agent.dispose() 时或 pack 卸载时调用：

```typescript
async dispose() {
  await this.client?.disconnect();
}
```

---

## 运行时隔离

> Phase 3 特性。保证多个 pack 挂载到同一 Agent 时互不干扰。

### 冲突检测

**默认模式**（`namespaced: false`）。注册 tool/agent/capability 时，PackManager 检查全局是否已被其他 pack 占用。冲突即抛 `PackConflictError`：

```text
PackConflictError: Resource conflict: tool "query" is already registered
(already owned by pack "legal-pack"). Either rename it, enable namespaced
mode, or unuse the conflicting pack first.
```

这意味着两个 pack 必须主动解决冲突（改名、开 namespaced、或卸载冲突 pack）。

### 命名空间模式

在 pack 声明中加 `namespaced: true`，所有资源自动加 `<id>::` 前缀：

```typescript
class LegalPack implements VerticalPack {
  readonly id = 'legal';
  readonly namespaced = true;  // ← 开启

  tools = [
    { name: 'query', tool: queryTool },   // 实际注册为 "legal::query"
  ];
  agents = [
    { name: 'reviewer', config: {...} },  // 实际注册为 "legal::reviewer"
  ];
}
```

多个 pack 即使同名资源也互不干扰：

| 注册名（代码） | 实际注册名（legal） | 实际注册名（medical） |
|--------------|-------------------|-------------------|
| `query`      | `legal::query`    | `medical::query`  |
| `reviewer`   | `legal::reviewer` | `medical::reviewer` |

Coordinator 在调用子 Agent 时也需要使用带前缀的名称：

```typescript
// namespaced 模式下，agent 类型名包含前缀
await agent.dispatch('审核合同', {
  modelId: 'legal::reviewer',
});
```

### 卸载 pack

运行时可以精确卸载某个 pack 及其注册的全部资源：

```typescript
// 卸载法务包（医疗包不受影响）
await agent.unuse('legal');

// 卸载后同名资源可以再被其他 pack 使用
```

卸载清理的资源包括：
- ✅ 工具（从 ToolRegistry 移除）
- ✅ 子 Agent（从 agentRegistry 和 runner 移除）
- ✅ 能力模块（从 capabilityRegistry 移除并调用 dispose）
- ✅ Hook（按 hook id 精确移除）
- ✅ 技能（按名从 skillRegistry 移除）
- ✅ 调用 pack.dispose() 释放外部资源

### 卸载 vs 销毁

| | `agent.unuse(packId)` | `agent.dispose()` |
|--|----------------------|-------------------|
| 影响范围 | 单个 pack | 整个 Agent |
| 清理资源 | 该 pack 注册的资源 | 所有 capability + 所有 pack |
| 后续操作 | 可继续使用 Agent | Agent 不可用 |
| 适用场景 | 切换垂直场景 | 完全关闭 |

---

## 依赖管理

Pack 可以声明依赖其他 pack，PackManager 按拓扑排序初始化（被依赖的先注册）。

```typescript
class CompliancePack implements VerticalPack {
  readonly id = 'compliance';
  readonly dependencies = ['legal']; // 依赖法务包

  // 可以在 setup 中使用 legal 包的资源
  async setup({ agent }) {
    // compliance 初始化时，legal 已就绪
  }
}
```

```
agent.use(new LegalPack())         // 无依赖，先初始化
     .use(new CompliancePack());   // 依赖 legal，后初始化
```

当前限制：
- ❌ 不支持跨 pack 版本约束（SemVer 范围）
- ✅ 循环依赖 → `PackCycleError`
- ✅ 依赖不存在 → `PackDependencyMissingError`
- ✅ 隐式依赖：先注册的 pack 先初始化，被依赖的 pack 必须显式声明 `dependencies`

---

## CLI 脚手架

### `hive-pack init <name>`

生成 pack 骨架目录。

```bash
npx hive-pack init my-pack                                    # 最小参数
npx hive-pack init legal-helper --description "法务辅助场景"    # 带描述
```

生成后按提示：
```bash
cd my-pack
npm install          # 安装依赖
# 编辑 src/index.ts 添加业务逻辑
npm run build        # 编译 TypeScript
```

### `hive-pack validate`

验证当前目录的 pack 是否合法（动态导入 `dist/index.js`，校验 `VerticalPack` 接口完整性）：

```bash
cd my-pack
npm run build
npx hive-pack validate
```

### `hive-pack --help`

```
用法: hive-pack <command> [options]

命令:
  init <name>    创建新的 vertical pack 项目
  validate       验证当前目录的 pack 配置
  --help         显示帮助
  --version      显示版本号
```

---

## 分发与发布

一个 Vertical Pack 就是一个标准的 npm 包。

### 构建

```bash
npm run build    # tsc 编译到 dist/
```

`package.json` 中需要声明 `exports` 字段以便 ESM 导入：

```json
{
  "name": "@hive-pack/my-legal-pack",
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".": "./dist/index.js"
  },
  "peerDependencies": {
    "@bundy-lmw/hive-core": "^1.0.0"
  }
}
```

**注意**：`@bundy-lmw/hive-core` 应声明为 `peerDependencies`（非 `dependencies`），让宿主项目的 Hive 版本和 pack 共享同一安装。`@ai-sdk/openai` 等底层依赖同理。

### 发布

```bash
npm publish        # 公开包
npm publish --access public   # 首次发布作用域包
```

### 消费

```bash
npm install @hive-pack/my-legal-pack
```

```typescript
import { Agent } from '@bundy-lmw/hive-core';
import { MyLegalPack } from '@hive-pack/my-legal-pack';

const agent = new Agent();
agent.use(new MyLegalPack());
await agent.initialize();
```

---

## 最佳实践

### 1. 一个 pack 只做一个垂直场景

不要在一个 pack 里塞多个不相关的业务。如果既有法务又有合规，拆成两个 pack 并用 `dependencies` 表达关系。

### 2. 使用 namespaced 防冲突

即使你只写一个 pack，也建议开启 `namespaced: true`——当项目发展到多个 pack 时，不会被其他 pack 的命名"冲"到。

### 3. Tool 的 execute 不要持有副作用

Tool 的 `execute` 应该是纯函数——接收输入，返回结果，不修改外部状态。有状态操作放在 Capability 中。

### 4. Capability 负责有状态连接

数据库连接、缓存、外部 API 客户端等，应该封装为 Capability（有 `initialize`/`dispose` 生命周期），而不是在 tool 的 `execute` 中创建。

### 5. 用 setup 校验配置，不要抛在构造函数

```typescript
// ✓ 正确：构造函数只保存参数
class MyPack implements VerticalPack {
  constructor(private config: { apiKey?: string }) {}

  async setup({ agent, context }) {
    if (!this.config.apiKey) {
      throw new Error('[MyPack] 需要 apiKey 配置');
    }
    // 连接外部服务
  }
}

// ✗ 错误：构造函数中做实际工作
class MyPack implements VerticalPack {
  constructor(config: { apiKey?: string }) {
    this.client = new Client(config.apiKey); // 这时的 Agent 还没初始化
  }
}
```

### 6. 先 use 再 initialize

所有 `agent.use(...)` 调用必须在 `agent.initialize()` 之前（或卸载后重新 apply），否则报错。

### 7. 测试 pack

```typescript
import { describe, it, expect } from 'vitest';
import { MyPack } from '../src/index.js';

describe('MyPack', () => {
  it('应该正确注册工具和子 Agent', () => {
    const pack = new MyPack();
    expect(pack.id).toBe('my-pack');
    expect(pack.tools).toHaveLength(1);
    expect(pack.agents).toHaveLength(1);
  });
});
```

集成测试时可以创建一个测试用 Agent 并挂载 pack：

```typescript
it('集成测试', async () => {
  const agent = new Agent({ provider: { ... } });
  agent.use(new MyPack());
  await agent.initialize();

  const result = await agent.dispatch('测试任务');
  expect(result.success).toBe(true);

  await agent.dispose();
});
```

### 8. 包体积控制

- 只发布 `dist/`、`skills/`、`package.json`、`README.md`（通过 `package.json` 的 `files` 字段控制）
- 大型领域知识（法规数据库、模型文件）应作为运行时获取，不要打包
- 外部 API 依赖应在 `setup()` 中延迟初始化
