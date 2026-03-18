# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Agent Service - 面向 C 端应用的 Claude Agent 服务 SDK，整合 CC-Switch 生态。

## Common Commands

```bash
# Development
npm run build          # TypeScript 编译
npm run dev            # TypeScript 监视模式
npm run server         # 启动 HTTP 服务 (端口 3000)
npm run cli            # 启动命令行工具

# Testing
npm test               # 运行所有测试（单元测试 + 集成测试，使用 mock）
npm run test:watch     # 测试监视模式
npm run test:coverage  # 生成覆盖率报告
npm run test:e2e       # 运行 E2E 测试（真实 API 调用，需要配置 API Key）

# Single test file
npx vitest run tests/skills.test.ts
npx vitest run tests/e2e/agent-real.test.ts --config vitest.e2e.config.ts
```

## E2E Testing

E2E 测试使用真实的 LLM API 验证 Agent 的实际响应能力。

### 配置方法

**方式 1：使用 providers.json**
```bash
cp providers.example.json providers.json
# 编辑 providers.json，填入你的 API Key
npm run test:e2e
```

**方式 2：使用环境变量（CI 环境）**
```bash
TEST_API_KEY=xxx TEST_PROVIDER_ID=glm npm run test:e2e
```

### 无配置自动跳过

如果没有配置 API Key，E2E 测试会自动跳过：
```
✓ tests/e2e/agent-real.test.ts (1 test) | 1 skipped
```

### 注意事项

- E2E 测试会产生 **API 费用**
- 超时时间设置为 60 秒（LLM 响应较慢）
- 测试串行执行（避免 API 限流）
- 使用宽松断言（LLM 响应内容不固定）

## Architecture

### 核心设计原则

**主 Agent 作为唯一入口** - 所有功能通过 Agent 类访问，委托给能力模块实现。

```
Agent (主入口)
├── ProviderCapability  - 提供商管理 (CC-Switch + 内置预设)
├── SkillCapability     - 技能管理 (模块化扩展)
├── ChatCapability      - 对话功能
├── SubAgentCapability  - 子 Agent (Explore/Plan/General)
└── WorkflowCapability  - 工作流引擎
```

### 子 Agent 系统 (Claude Code 风格)

| Agent | 模型 | 工具 | 用途 |
|-------|------|------|------|
| Explore | Haiku (快速) | 只读 | 文件发现、代码搜索 |
| Plan | 继承 | 只读 | 计划研究、收集上下文 |
| General | 继承 | 全部 | 复杂任务、代码修改 |

### 目录结构要点

```
src/
├── agents/
│   ├── core/           # Agent 核心实现 (Agent.ts, AgentContext.ts)
│   ├── capabilities/   # 能力模块 (委托模式)
│   ├── prompts/        # Prompt 模板系统
│   └── registry/       # Agent 注册表
├── providers/          # LLM 提供商管理
│   ├── sources/        # 配置来源 (CC-Switch, 环境变量, 本地配置)
│   ├── presets/        # 内置预设 (Anthropic, OpenAI, 国产 LLM 等)
│   └── models/         # 模型规格和成本估算
├── skills/             # 技能系统 (加载器, 匹配器, 注册表)
├── hooks/              # Hooks 系统 (生命周期事件)
├── services/           # 服务层 (ServiceRegistry, BaseService)
└── tools/              # MCP 工具 (偏好, 记忆)

skills/                 # 技能定义文件 (*.md with YAML frontmatter)
tests/
├── unit/               # 单元测试（使用 mock）
├── integration/        # 集成测试（使用 mock）
├── e2e/                # E2E 测试（真实 API 调用）
│   ├── test-helpers.ts # 测试辅助函数
│   ├── agent-real.test.ts    # Agent 真实 API 测试
│   └── provider-real.test.ts # Provider 连接测试
├── mocks/              # Mock 工具
└── utils/              # 测试工具函数
```

## Configuration

### 提供商配置

复制 `providers.example.json` 为 `providers.json` 并填入 API Key：

```bash
cp providers.example.json providers.json
```

或使用环境变量：
```bash
GLM_API_KEY=xxx
DEEPSEEK_API_KEY=xxx
ANTHROPIC_API_KEY=xxx
```

### 技能定义

技能位于 `skills/` 目录，使用 YAML frontmatter：

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

## Hooks System

Hooks 提供生命周期事件钩子，在关键节点插入自定义逻辑。

| Hook 类型 | 触发时机 |
|-----------|----------|
| `session:start` / `session:end` / `session:error` | 会话生命周期 |
| `tool:before` / `tool:after` | 工具调用前后 |
| `capability:init` / `capability:dispose` | 能力生命周期 |
| `workflow:phase` | 工作流阶段变化 |

```typescript
// 注册 Hook 示例 (server.ts 中有完整示例)
agent.context.hookRegistry.on('tool:before', async (ctx) => {
  if (ctx.toolName === 'Bash') {
    // 安全检查逻辑
    return { proceed: true }; // 或 { proceed: false, error: ... }
  }
}, { priority: 'highest' });
```

## Key Implementation Patterns

### 能力模块委托模式

Agent 类不直接实现功能，而是委托给能力模块：

```typescript
// Agent.ts
class Agent {
  private chatCap: ChatCapability;
  private workflowCap: WorkflowCapability;

  async chat(prompt: string) {
    return this.chatCap.send(prompt);  // 委托
  }
}
```

### 提供商配置链

配置按优先级合并：CC-Switch > 本地配置 > 环境变量 > 预设默认值

### 服务注册表

`ServiceRegistry` 提供服务生命周期管理和依赖注入：

```typescript
const registry = new ServiceRegistry();
registry.register(service);
await registry.initializeAll();
await registry.startAll();
```

## Notes

- TypeScript ESM 模块，Node.js 18+
- 使用 `tsx` 运行 TypeScript (开发时)
- 测试框架: Vitest
- 依赖 `@anthropic-ai/claude-agent-sdk` 作为底层 SDK
- `cc-switch` 是可选的 peer dependency
