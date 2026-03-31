# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hive - 多 Agent 协作框架，AI Agent SDK。pnpm monorepo，TypeScript ESM，Node.js 18+。

## Monorepo Structure

```
packages/core/           @bundy-lmw/hive-core        Agent SDK 核心
packages/plugins/feishu/ @bundy-lmw/hive-plugin-feishu 飞书插件
apps/server/             @bundy-lmw/hive-server       HTTP/WS 服务 (Hono + ws)
apps/desktop/            @bundy-lmw/hive-desktop      Tauri 2 桌面应用 (Rust + React 19)
skills/                                             技能定义 (*.md + YAML frontmatter)
```

依赖关系：desktop → server → core，plugin-feishu → core。

## Commands

```bash
# 构建（按拓扑排序）
pnpm -r build
pnpm --filter @bundy-lmw/hive-core build
pnpm --filter @bundy-lmw/hive-server build

# 开发
pnpm --filter @bundy-lmw/hive-core dev        # tsc --watch
pnpm --filter @bundy-lmw/hive-server dev      # tsc --watch
cd apps/desktop && pnpm dev                    # Tauri dev（启动 Vite + Rust + server）

# 测试
pnpm test                                       # core 单元 + 集成测试（mock）
pnpm test:e2e                                   # core E2E 测试（真实 LLM API）
npx vitest run packages/core/tests/unit/skills.test.ts           # 单个测试文件
npx vitest run packages/core/tests/e2e/agent-real.test.ts --config packages/core/vitest.e2e.config.ts  # 单个 E2E

# 发布（自动 build + version patch + publish）
pnpm publish:core
pnpm publish:server
pnpm publish:feishu
```

## E2E Testing

E2E 测试调用真实 LLM API，会产生费用。未配置 API Key 时自动跳过。

配置方式（二选一）：
```bash
# 方式 1：环境变量
TEST_API_KEY=xxx TEST_PROVIDER_ID=glm pnpm test:e2e

# 方式 2：hive.config.json
cp apps/server/hive.config.example.json apps/server/hive.config.json
```

## Architecture

### 核心设计：能力委托模式

Agent 是唯一入口，所有功能委托给能力模块：

```
Agent
├── ProviderCapability  - LLM 提供商管理
├── SkillCapability     - 技能管理（模块化扩展）
├── ChatCapability      - 对话
├── SubAgentCapability  - 子 Agent（Explore/Plan/General）
├── WorkflowCapability  - 工作流引擎（explore → plan → execute）
├── SessionCapability   - 会话持久化（SQLite）
├── ScheduleCapability  - 定时任务（node-cron）
└── TimeoutCapability   - 心跳与超时监控
```

### 子 Agent 系统（Claude Code 风格）

| Agent | 工具 | 用途 |
|-------|------|------|
| Explore | 只读 (file+glob+grep+web) | 文件发现、代码搜索 |
| Plan | 只读 (file+glob+grep+web) | 计划研究、收集上下文 |
| General | 全部 (7 个内置工具) | 复杂任务、代码修改 |

### Server 网关

- **HTTP**（Hono）：POST /chat, /api/sessions, /webhook/:plugin/:appId
- **WebSocket**：`/ws/admin`（管理面板）、`/ws/chat`（对话）
- 默认端口：4450

### Desktop 应用

Tauri 2 桌面端，Rust sidecar 管理 server 进程：
- **开发模式**：用系统 `node` 直接运行 `apps/server/dist/main.js`
- **生产模式**：执行 Node.js SEA 单文件二进制（`apps/server/scripts/bundle.sh` 打包，约 106MB）
- 前端通过 WebSocket (`localhost:4450`) 与 server 通信
- Zustand 状态管理，TanStack React Query 数据请求

### Provider 配置链

优先级：外部配置 (`hive.config.json`) > 环境变量 > 预设默认值

国产 LLM 通过 OpenAI 兼容适配器 + AI SDK (`@ai-sdk/openai`) 接入，不依赖 `claude-agent-sdk`。

### Workspace 协议

本地开发用 `workspace:*`，发布到 npm 后用户安装的是 `^x.x.x`：
- `apps/server` 依赖 core：`"@bundy-lmw/hive-core": "workspace:*"`
- `packages/plugins/feishu` 依赖 core：`"@bundy-lmw/hive-core": "^1.0.0"`（独立 npm 包）

## Hooks System

生命周期事件钩子，支持优先级（highest > high > normal > low > lowest）：

| Hook | 触发时机 |
|------|----------|
| `session:start/end/error` | 会话生命周期 |
| `tool:before/after` | 工具调用前后 |
| `capability:init/dispose` | 能力生命周期 |
| `workflow:phase` | 工作流阶段变化 |

```typescript
agent.context.hookRegistry.on('tool:before', async (ctx) => {
  if (ctx.toolName === 'Bash') {
    return { proceed: true }; // 或 { proceed: false, error: '...' }
  }
}, { priority: 'highest' });
```

## Key Patterns

- **内置工具安全层**：`tools/built-in/utils/security.ts`（路径约束、SSRF 防护、命令白名单）
- **ServiceRegistry**：服务生命周期管理和依赖注入
- **技能定义**：`skills/` 目录下 Markdown 文件 + YAML frontmatter
- **插件系统**：server 动态加载 npm 插件，通过 WebSocket channel 通信

## Tech Stack

- **Core/Server**: TypeScript ESM, AI SDK, Hono, better-sqlite3, Zod v4, Vitest
- **Desktop**: Tauri 2 (Rust), React 19, Vite 7, Tailwind CSS 4, Zustand
- **Build**: esbuild (server bundle), Node.js SEA (单文件二进制), tsc
