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
website/                 @bundy-lmw/hive-website     Landing Page (Next.js 15 + Tailwind CSS 4)
.hive/skills/                                         内置技能 (committed, 在 DEFAULT_WORKSPACE_DIR 下)
.hive/skills.local/                                   用户安装的技能 (gitignored, via hive skill add)
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

# 技能管理 (兼容 agentskills.io 生态)
hive skill add vercel-labs/agent-skills           # 从 GitHub 仓库安装所有技能
hive skill add vercel-labs/agent-skills -s frontend-design  # 仅安装指定技能
hive skill add vercel-labs/agent-skills --list    # 预览可用技能
hive skill list                                     # 列出已安装技能
hive skill remove <name>                            # 移除用户技能
```

## IDE 协作约定（固定，勿改）

在 hive 仓库内改代码、查代码时：

- **只用** Cursor 内置工具（Read / Grep / Glob / Shell / StrReplace 等）或 omp 运行时内置工具（grep / glob / file / bash 等）。
- **禁止**调用 IDE 全局注入的第三方 MCP（如 codebrain、context7、github、tushare、open-websearch 等）——它们不属于 omp，且与 Hive Server 的 MCP 栈无关。
- **omp 自身的 MCP** 仅指：内置 `officecli` + 用户在 Desktop 启用并写入 `.hive/mcp-servers.json` 的服务；catalog 见 `apps/server/mcp-catalog.json`。
- omp 侧没有对应 MCP 时，**不得**改用其他 MCP；改用本地搜索/读文件，或 `semble search`（CLI，非 MCP）。

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

### 核心设计：能力委托 + 场景路由

Agent 是唯一入口，基础设施委托给 Capability，用户可见能力委托给 Scenario：

```
Agent（进程入口）
├── ProviderCapability    — LLM 提供商
├── SkillCapability       — 技能管理
├── SessionCapability     — 会话持久化（SQLite）
├── CoordinatorCapability — 对话 + Worker 委派
├── ScheduleCapability    — 定时任务服务（node-cron）
└── TimeoutCapability     — 心跳与超时

TaskRouter（Coordinator 内唯一路由入口）
└── ScenarioRegistry
    ├── office-document  → office Worker（officecli MCP + bash）
    └── recurring-task   → schedule Worker
```

**术语**：Agent = 入口类；Worker = 委派执行单元；Scenario = 用户可见能力包；Capability = 基础设施模块。

### Worker 类型

| Worker | 工具 | 用途 |
|--------|------|------|
| explore | 只读 (file+glob+grep+web) | 文件发现、代码搜索 |
| plan | 只读 | 计划研究、收集上下文 |
| general | 全部内置工具 | 复杂任务、代码修改 |
| office | bash + officecli MCP | PPT / Word / Excel |
| schedule | schedule 工具 | 定时任务管理 |

### Server 网关

- **HTTP**（Hono）：POST /chat, /api/sessions, /webhook/:plugin/:appId
- **WebSocket**：`/ws/admin`（管理面板）、`/ws/chat`（对话）
- 默认端口：4450

### Desktop 应用

Tauri 2 桌面端，Rust sidecar 管理 server 进程：
- **开发模式**：用系统 `node` 直接运行 `apps/server/dist/main.js`
- **生产模式**：用 Bun 运行 `apps/server/dist/main.js`（Node SEA 已移除，pi 核要求 Bun）
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

## GitHub 流程

每个 change 从 issue 到合并的完整链路：

```
Issue → Branch → Implement → Push → PR → Review → Merge → Close Issue → Update Project
```

### Step 1 — 创建 Issue

```bash
gh issue create --repo 1695365384/hive \
  --title "feat: 新功能名称" \
  --body "## 描述
## 验收标准
- [ ] ..."
```

Issue 自动出现在 Project 面板的 "Todo" 列。

### Step 2 — Issue 分支

从 main 创建分支，分支名格式 `issue/<number>-<short-desc>`：

```bash
git checkout -b issue/1-health-dashboard
```

### Step 3 — 实现

实现功能。

### Step 4 — 推送

```bash
git push -u origin issue/1-health-dashboard
```

### Step 5 — 提 PR

```bash
gh pr create --repo 1695365384/hive \
  --title "feat: 新功能名称" \
  --body "$(cat <<'EOF'
## Summary
- 实现了 xxx

## Test plan
- [ ] pnpm test 通过
- [ ] pnpm test:e2e 通过（如涉及 API 变更）

Closes #1
EOF
)"
```

PR body 里的 `Closes #1` 会自动关联 issue。PR 创建后 issue 移到 "In Progress"。

### Step 6 — Review

- 代码审查通过后合并 PR
- 合并方式：squash（保持 main 历史干净）

### Step 7 — 关闭 Issue + 更新 Project

PR 合并后：
- Issue 自动关闭（因为 PR body 里有 `Closes #1`）
- Issue 移到 Project 面板的 "Done" 列

### 自动触发规则

- 用户说"提交代码"/"提 PR" → 自动执行 Step 4-7（测试 → issue 分支 → 推送 → PR）
- PR 合并后 → 自动关闭关联 issue 并更新 Project 面板

### Project 面板

仓库使用 GitHub Project (V2)，三列看板：

| 列 | 状态 | 触发条件 |
|----|------|----------|
| Todo | 待处理 | Issue 创建时 |
| In Progress | 进行中 | PR 创建时 |
| Done | 已完成 | PR 合并时 |

## Tech Stack

- **Core/Server**: TypeScript ESM, AI SDK, Hono, better-sqlite3, Zod v4, Vitest
- **Desktop**: Tauri 2 (Rust), React 19, Vite 7, Tailwind CSS 4, Zustand
- **Build**: tsc + Bun 运行 server；Desktop 为 Tauri/Vite（不再打 Node SEA）
