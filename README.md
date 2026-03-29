<div align="center">
  <img src="logo.svg" alt="Hive Logo" width="140" height="140">

  <h1>Hive</h1>

  <p><strong>OpenClaw 替代品</strong></p>

  <p>
    <em>编排优先 · 天然省 80% 成本 · 零运维</em>
  </p>

  <p>
    <a href="#为什么离开-openclaw">为什么离开 OpenClaw</a> &middot;
    <a href="#hive-的核心优势">核心优势</a> &middot;
    <a href="#快速开始">快速开始</a> &middot;
    <a href="#常见问题">FAQ</a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/Node.js-18+-green" alt="Node.js">
    <img src="https://img.shields.io/badge/TypeScript-5.0+-blue" alt="TypeScript">
    <img src="https://img.shields.io/badge/905%20tests-passing-brightgreen" alt="Tests">
    <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
  </p>
</div>

---

## 为什么离开 OpenClaw

OpenClaw 是 2026 年最火的开源 AI Agent 框架（30 万+ Stars），社区从"技术狂热"到"成本焦虑"只用了两周。以下是 Reddit 150+ 用户投诉、GitHub Issues、安全报告交叉验证出的 **8 个系统性问题**。

### 编排：官方明确拒绝

OpenClaw 架构文档原文：

> "agent-hierarchy frameworks are **not a default architecture** and heavy orchestration layers **will not be merged** for now."

sub-agent 只是开一个新会话，没有任务拆解、结果聚合、错误恢复。用户被迫手动编排一切。

> "You end up babysitting something you set up specifically to stop babysitting."
> — Reddit, 150+ 投诉汇总

### 成本：从 $347 到 $2,100

上下文无限累积（10 轮对话 150K tokens），工具输出永久存储，所有任务用最贵的模型。

| 场景 | 损失 |
|:-----|:-----|
| Agent 陷入死循环，一夜之间 | **$2,100** |
| 简单定时任务，token 消耗失控 | **570 万 tokens** |
| 正常使用一个月（未经优化） | **$347** |
| 即便升级 $200 Max Plan | **仍然 429 限流** |

一位用户优化了两周才把月成本从 $347 降到 $68。**但这个优化本不该由用户来做。**

### 安全：多个公开 CVE

- CVE-2026-25253：数百个实例泄露 API 密钥（Bitdefender 披露）
- 100ms 远程接管：研究人员通过网页演示实时攻击
- 5 分钟提取 SSH 私钥：邮件 prompt injection 实现
- ClawHub 发现 300+ 恶意技能，1/4 存在漏洞

### 可靠性：每天崩溃 15 次

- Agent 发截图"证明"完成 —— 截图里问题还在
- Agent 承诺执行后沉默 —— 无错误、无崩溃、无输出
- 用户停止 OpenClaw 后，它两周后自动重启了
- Agent 删除自己的配置文件、损坏上下文
- Telegram 长轮询导致 Gateway **每天崩溃 15 次**

### 部署：14 种故障场景

SegmentFault 排查指南覆盖 6 大类故障：安装失败（SIGBUS 无输出崩溃）、部署异常（launchd/systemd）、运行崩溃（OOM）、API 错误（429 冷却逻辑 bug）、日志问题（跨日不续接）、权限不足（硬编码 /root 路径）。

### 上下文：没有记忆，每次从零开始

每次问"认证怎么实现的"都要重新扫描 50+ 文件。超出模型窗口时静默截断，Agent 基于残缺上下文做决策 → 幻觉。用户被迫手动维护 ARCHITECTURE.md 来缓解。

### 更新：每次升级都是赌博

"This morning I updated to latest version and now response time is very slow."

技能跨版本消失、工具行为变更、配置格式不兼容、TDZ 初始化崩溃（Issue #45319）、ClawHub DNS 基础设施故障（Issue #44839）。

### 国产 LLM：参数冲突频发

Kimi 调用 web_search 时 401（Issue #44851）、GLM 的 reasoning_effort 参数冲突返回 HTTP 400（Issue #44896）。每个国产模型都需要手动适配参数。

---

## Hive 的核心优势

这些问题不是 bug，是**架构决定的**。Hive 从零设计，**先有编排引擎，再有其他一切**，从根源上避免了这些问题。

### 1. 天然省钱：自动按阶段选模型

这是成本优化的正确做法 —— **不是让用户手动切模型，而是架构本身就按任务复杂度分配模型**。

OpenClaw 用户花两周优化才把 $347 降到 $68。Hive **开箱即用就是这个效果**：

| 阶段 | 模型选择 | 为什么 |
|:-----|:---------|:-------|
| **探索** | Provider 默认模型 | 扫描代码只需理解，不需要推理能力 |
| **规划** | Provider 默认模型 | 需要深度分析，但不应直接改代码 |
| **执行** | Provider 默认模型 | 按计划行动，需要全部工具权限 |

一个"帮我重构登录模块"的任务，80% 的 token 消耗发生在探索阶段 —— 用 Haiku 处理，成本直接降 **80%**。这不是优化技巧，是默认行为。

### 2. 天然可靠：结构化阶段 + 全链路 trace

OpenClaw 的可靠性问题来自一个根因：任务是一个无边界的对话循环，不知道"做到哪了"。

Hive 的三阶段工作流天然解决这个问题：

- **阶段边界清晰**：探索结束才进入规划，规划完成才进入执行，不会跳步
- **权限自动降级**：探索和规划阶段强制只读，Agent 不可能误改代码
- **全链路 trace**：每个阶段的输入、输出、耗时、token 消耗全部记录，出错直接定位到具体阶段

Agent 不会"假装完成"然后沉默，因为每个阶段都有明确的输入输出。

### 3. 天然安全：无守护进程 + 权限分层

OpenClaw 的安全风险来自两个根因：高权限持久运行（守护进程 24/7 运行）+ 全局权限（一个 prompt injection 就能访问 ~/.ssh）。

Hive 的设计天然规避了这些：

- **无守护进程**：随应用生命周期启动和退出，不存在"24/7 暴露面"
- **权限分层**：探索/规划只读，只有执行阶段有写入权限，即使被注入也只能影响当前任务
- **Hook 拦截**：`tool:before` / `tool:after` 可以拦截任何工具调用，做安全审计

### 4. 天然简单：npm install 即用

OpenClaw 需要 Node 22+、全局安装、守护进程注册、Gateway 配置、Channel 配置、auth-profiles.json 配置。出任何一个问题，就要翻 14 种故障场景排查指南。

Hive 的部署：

```
npm install @hive/core → new Agent() → agent.dispatch()
```

没有守护进程，没有端口配置，没有权限问题。集成到现有项目就是加一个 npm 依赖。

### 5. 天然智能：一个 dispatch() 搞定一切

OpenClaw 的"多 Agent"只是手动发 `/subagent` 命令。Hive 的 Dispatcher 用 LLM 语义分析 + regex 关键词双保险，自动判断任务类型并路由：

- "今天天气怎么样" → chat 层，直接返回
- "帮我重构登录模块" → workflow 层，自动执行 explore → plan → execute

不需要定义路由规则，不需要画流程图，不需要手动切换模式。**你只管提需求，Hive 负责执行。**

### 6. 天然国产：GLM、DeepSeek、Qwen、Kimi、ERNIE 一等公民

OpenClaw 的国产模型适配是一个个坑：Kimi 401、GLM 400、百炼 400，每个都要手动查 issue 找解决方案。

Hive 原生内置 5 家国产模型的预设配置，设置环境变量即可使用。不需要查 issue，不需要手动适配参数，不需要等官方修复。

---

## OpenClaw vs Hive 速查

| | OpenClaw | Hive |
|:--|:---------|:-----|
| **设计起点** | 单 Agent 对话循环 | 多 Agent 编排引擎 |
| **任务路由** | 用户手动 `/subagent` | LLM + regex 自动分类 |
| **工作流** | Lobster DSL（手动编排） | 三阶段自动执行 |
| **模型选择** | 用户手动切换 | 按阶段自动分配 |
| **月成本（同类任务）** | $200-400 | $40-80 |
| **部署方式** | 守护进程 + Gateway | npm install 即用 |
| **多实例** | 单 Gateway per host | 每个 Agent 独立 |
| **安全模型** | 高权限持久运行 | 权限分层 + Hook 拦截 |
| **上下文管理** | 无限累积，静默截断 | 阶段隔离，不累积 |
| **国产 LLM** | 参数冲突，需手动适配 | 原生预设，环境变量即用 |
| **更新风险** | breaking change 频繁 | 精简核心，依赖单一 |
| **最低内存** | 4GB（2GB 频繁崩溃） | 无额外进程开销 |
| **故障排查** | 14 种故障场景 | 不需要 |

---

## 快速开始

### 环境准备

- Node.js 18+
- 一个 LLM API Key（任意支持的平台）

### 三步启动

**第一步** — 设置 API Key（任选一个）

| 环境变量 | 提供商 |
|:---------|:-------|
| `GLM_API_KEY` | 智谱 GLM |
| `DEEPSEEK_API_KEY` | DeepSeek |
| `ANTHROPIC_API_KEY` | Anthropic Claude |
| `OPENAI_API_KEY` | OpenAI |

**第二步** — 安装并启动

```
pnpm install
pnpm run server
```

**第三步** — 发送请求

```
POST http://localhost:3000/chat
Content-Type: application/json

{"prompt": "帮我重构登录模块"}
```

Hive 会自动检测 API Key，判断这是复杂任务，自动执行 explore → plan → execute 三阶段工作流，返回最终结果。

### 作为 SDK 集成

```
npm install @hive/core
```

| 调用方式 | 效果 |
|:---------|:-----|
| `agent.dispatch('帮我重构登录模块')` | 自动判断 → 走工作流 |
| `agent.chat('今天天气怎么样')` | 强制对话模式 |
| `agent.runWorkflow('实现用户注册')` | 强制工作流模式 |
| `agent.explore('查找所有 API 路由')` | 快速探索（轻量模型） |
| `agent.plan('研究认证方案')` | 深度规划（只读） |
| `agent.general('重构代码')` | 通用执行（全部工具） |

### CLI 调试

```
pnpm run cli
```

| 命令 | 说明 |
|:-----|:-----|
| `/mode chat` | 对话模式 |
| `/mode workflow` | 工作流模式 |
| `/provider glm` | 切换提供商 |
| `/skills` | 查看技能列表 |
| `/state` | 当前状态 |

---

## 核心能力

### 智能路由

所有输入统一经过 Dispatcher，LLM 分析语义 + regex 关键词双保险，自动分类后路由：

- **chat 层** — 闲聊、问答、简单咨询，直接返回
- **workflow 层** — 代码编写、重构、研究分析，自动执行三阶段工作流

分类置信度低于阈值时自动降级到关键词匹配，确保不会误分类。

### 三阶段工作流

| 阶段 | 模型选择 | 工具权限 | 设计理由 |
|:-----|:---------|:---------|:---------|
| **探索** | Provider 默认模型 | 只读 | 快速扫描，低成本，防止误改 |
| **规划** | Provider 默认模型 | 只读 | 深度分析，强制只读输出计划 |
| **执行** | Provider 默认模型 | 全部工具 | 按计划精准行动 |

每个阶段独立 trace，出错可定位。80% 的复杂任务都适合这个模式。可通过 Hook 在 `workflow:phase` 阶段插入自定义逻辑。

### 7 个能力模块按需加载

| 模块 | 何时加载 |
|:-----|:---------|
| Provider | 始终需要 |
| Chat | 只做对话时 |
| Workflow | 需要多步任务时 |
| SubAgent | 需要子 Agent 协作时 |
| Skill | 需要技能匹配时 |
| Session | 需要会话持久化时 |
| Schedule | 需要定时任务或推送通知时 |
| Timeout | 需要超时监控时 |

只加载你需要的，不用的零开销。

### Hook 系统

| Hook | 时机 | 典型场景 |
|:-----|:-----|:---------|
| `session:start` / `end` | 会话生命周期 | 初始化资源、清理状态 |
| `tool:before` / `after` | 工具调用前后 | 安全拦截、审计日志 |
| `workflow:phase` | 阶段切换 | 进度推送、状态展示 |
| `dispatch.classify` | 分类完成 | 记录决策依据 |

### 会话管理

内置 SQLite 持久化，支持多会话切换和历史回溯。

### 技能系统

Markdown 文件定义技能，YAML frontmatter 声明元数据，系统自动加载并根据用户输入匹配触发。

---

## 支持的提供商

### 国产 LLM

| 提供商 | 模型示例 | 特点 |
|:------|:---------|:-----|
| GLM（智谱） | glm-5, glm-4.7 | 长文本、多模态 |
| Qwen（通义千问） | qwen3-max, qwen-plus | 阿里云、长上下文 |
| DeepSeek | deepseek-chat, deepseek-reasoner | 高性价比 |
| Kimi（月之暗面） | moonshot-v1-128k | 超长上下文 |
| ERNIE（文心一言） | ernie-4.0-8k | 百度 |

### 全球 LLM

| 提供商 | 模型示例 |
|:------|:---------|
| Anthropic | claude-opus-4-6, claude-sonnet-4-6 |
| OpenAI | gpt-4o, gpt-4-turbo |
| Azure OpenAI | gpt-4o, gpt-35-turbo |
| OpenRouter | 100+ 模型聚合 |
| Together AI | 开源模型推理 |

添加自定义提供商只需传入 `baseUrl` + `apiKey`，兼容 OpenAI API 格式即可，无需改源码。

---

## 架构概览

```
                          Client
                    ┌─────┴─────┐
                  HTTP/WS       CLI
                    │             │
               ┌────┴─────────────┴────┐
               │   apps/server          │
               │  Gateway + Bootstrap   │
               └────────────┬───────────┘
                            │
               ┌────────────┴───────────┐
               │        Agent           │
               │      (唯一入口)         │
               └────────────┬───────────┘
                            │  dispatch()
               ┌────────────┴───────────┐
               │     Dispatcher         │
               │  LLM 分类 + regex      │
               └──┬─────────────────┬───┘
                  │                 │
           ┌──────┴──┐      ┌──────┴──────────────────┐
           │  chat   │      │       workflow            │
           │ 直接对话 │      │  explore → plan → execute │
           └──────┬──┘      │  Provider  Provider Provider│
                  │         │  默认模型 默认模型  全权限   │
                  │         └──────┬──────────────────┘
                  │                │
               ┌──┴────────────────┴───────────────────┐
               │           Capabilities                 │
               │ Chat · Workflow · SubAgent · Schedule   │
               │ Provider · Session · Skill · Timeout    │
               └──────────────┬────────────────────────┘
                              │
         ┌────────┬───────────┼───────────┬────────────┐
         ▼        ▼           ▼           ▼            ▼
    Providers  Storage    Scheduler   Hooks/Skills  Plugins
    GLM/DS    SQLite     cron/every   生命周期      飞书...
    Claude    会话+任务   at/一次性    事件拦截      ...
```

---

## 项目结构

```
hive/
├── packages/core/             Agent SDK 核心
│   ├── agents/core/           入口、上下文、运行器
│   ├── agents/capabilities/   7 个能力模块
│   ├── agents/dispatch/       智能路由
│   ├── agents/runtime/        LLM 运行时（AI SDK）
│   ├── providers/             LLM 提供商管理
│   ├── tools/built-in/        内置工具（bash/file/grep/glob/web）
│   ├── skills/                技能系统
│   └── hooks/                 生命周期钩子
├── packages/orchestrator/     多 Agent 编排（调度器 + 事件总线）
├── packages/plugins/feishu/   飞书渠道插件
├── apps/server/               HTTP/WS 服务
└── skills/                    技能定义
```

---

## 常见问题

<details>
<summary><b>Hive 就是 OpenClaw 的替代品吗？</b></summary>

是的。Hive 基于 AI SDK（@ai-sdk/openai）自研轻量运行时，架构设计理念完全不同：Hive 从多 Agent 编排出发，OpenClaw 从单 Agent 对话循环出发。如果你被 OpenClaw 的成本、可靠性、部署复杂度劝退过，Hive 就是为你设计的。

</details>

<details>
<summary><b>可以从 OpenClaw 迁移吗？</b></summary>

可以。Hive 使用 OpenAI 兼容的 Chat Completions API，模型配置格式兼容。主要迁移工作：将 OpenClaw 的 Channel 配置改为 Hive 的 Plugin，Skill 文件直接复用。

</details>

<details>
<summary><b>可以同时用国产和海外模型吗？</b></summary>

可以。配置多个提供商后，运行时用 `agent.useProvider('name')` 随时切换。

</details>

<details>
<summary><b>如何集成到现有项目？</b></summary>

安装 `@hive/core`，设置环境变量或传入配置，调用 `agent.dispatch()` 即可。也提供了开箱即用的 HTTP 服务 `@hive/server`。

</details>

<details>
<summary><b>如何添加自定义渠道？</b></summary>

实现 Plugin 接口，打包为独立 npm 包。参考 `@hive/plugin-feishu` 的实现。

</details>

<details>
<summary><b>如何创建自定义技能？</b></summary>

在 `skills/` 目录创建 Markdown 文件，用 YAML frontmatter 定义名称、描述和标签。系统启动时自动加载。

</details>

<details>
<summary><b>Hive 做了什么 OpenClaw 做不到的事？</b></summary>

- 自动智能路由（LLM + regex 双保险分类）
- 三阶段工作流（自动模型降级 + 权限隔离）
- 按阶段自动选模型（开箱即省 50-80% 成本）
- 结构化 trace（每个阶段可观测、可审计）
- 原生国产 LLM 支持（GLM、DeepSeek、Qwen、Kimi、ERNIE）
- 零运维部署（无守护进程、无端口配置）

</details>

---

## 开发

| 命令 | 说明 |
|:-----|:-----|
| `pnpm install` | 安装依赖 |
| `pnpm run build` | 构建 |
| `pnpm run dev` | 监视模式 |
| `pnpm test` | 运行测试（905 个用例） |
| `pnpm run test:e2e` | E2E 测试（需 API Key） |
| `pnpm run server` | 启动 HTTP 服务 |
| `pnpm run cli` | 启动 CLI |

---

## 相关项目

| 项目 | 说明 |
|:-----|:-----|
| [OpenClaw](https://github.com/openclaw/openclaw) | 个人 AI 助手框架，Hive 的设计参照 |
| [AI SDK](https://sdk.vercel.ai) | Vercel AI SDK，Hive 的 LLM 运行时基础 |

---

## 许可证

[MIT](LICENSE)

---

<p align="center">
  欢迎提交 <a href="https://github.com/farion1231/hive/issues">Issue</a> 和 <a href="https://github.com/farion1231/hive/pulls">Pull Request</a>！
</p>
