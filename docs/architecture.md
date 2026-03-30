# Hive Architecture

## Monorepo Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          hive/ (pnpm workspace)                     │
│                                                                     │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │ apps/server  │  │ packages/core    │  │ packages/orchestrator │  │
│  │ @bundy-lmw/hive-server │  │ @bundy-lmw/hive-core       │  │ @bundy-lmw/hive-orchestrator   │  │
│  └──────┬───────┘  └───────┬──────────┘  └───────────┬───────────┘  │
│         │                  │                         │              │
│  ┌──────┴──────────────────┴─────────────────────────┴───────────┐  │
│  │                packages/plugins/feishu                        │  │
│  │                @bundy-lmw/hive-plugin-feishu                            │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Call Flow

```
                         ┌─────────────┐
                         │   Client    │
                         │ (HTTP / WS) │
                         └──────┬──────┘
                                │
                         ┌──────▼──────┐
                         │   Gateway   │
                         │ http / ws   │
                         └──────┬──────┘
                                │
                    agent.dispatch(task, options)
                                │
                    ┌───────────▼───────────┐
                    │      Dispatcher       │
                    │   (smart router)      │
                    └───┬──────────────┬────┘
                        │              │
               ┌────────▼──┐    ┌─────▼────────┐
               │ LLM Class │    │ Regex Fallback│
               │ (≥0.5)    │    │ (keywords)    │
               └─────┬─────┘    └──────┬────────┘
                     │                 │
              ┌──────▼─────────────────▼──────┐
              │         Classification          │
              │  layer: 'chat' | 'workflow'     │
              └──────┬──────────────┬──────────┘
                     │              │
          ┌──────────▼──┐    ┌──────▼──────────┐
          │    chat     │    │    workflow      │
          │  单轮对话    │    │  多阶段任务      │
          └──────┬──────┘    └──────┬──────────┘
                 │                  │
                 │         ┌────────▼────────┐
                 │         │ 1. explore      │
                 │         │   (Provider默认) │
                 │         ├─────────────────┤
                 │         │ 2. plan         │
                 │         │   (Provider默认) │
                 │         ├─────────────────┤
                 │         │ 3. execute      │
                 │         │  (Provider默认)  │
                 │         └────────┬────────┘
                 │                  │
                 └────────┬─────────┘
                          │
                  ┌───────▼────────┐
                  │  AgentRunner   │
                  │  (SDK 执行层)  │
                  └───────┬────────┘
                          │
                  ┌───────▼────────┐
                  │  LLMRuntime   │
                  │  (自研运行时)  │
                  └───────┬────────┘
                          │
                  ┌───────▼────────┐
                  │  AI SDK       │
                  │  @ai-sdk/*    │
                  └───────┬────────┘
                          │
              ┌───────────▼───────────┐
              │   LLM Provider       │
              │ OpenAI 兼容适配器     │
              │ (GLM/DeepSeek/Qwen/  │
              │  Kimi/Anthropic/..) │
              └───────────────────────┘
```

## Agent Internal Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Agent                                │
│                     (唯一入口)                               │
│                                                             │
│  dispatch(task) ─────► Dispatcher                           │
│  chat(prompt)    ─────► dispatch(forceLayer='chat')          │
│  runWorkflow(t)  ─────► dispatch(forceLayer='workflow')      │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   AgentContext                        │   │
│  │  ┌──────────────┐ ┌────────────┐ ┌───────────────┐  │   │
│  │  │ProviderManager│ │ AgentRunner│ │ HookRegistry   │  │   │
│  │  └──────────────┘ └────────────┘ └───────────────┘  │   │
│  │  ┌──────────────┐ ┌────────────┐ ┌───────────────┐  │   │
│  │  │SkillRegistry │ │AgentRegistry│ │ ToolRegistry  │  │   │
│  │  └──────────────┘ └────────────┘ └───────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Capability Registry                     │    │
│  │  初始化顺序: session → provider → skill → chat →    │    │
│  │            subAgent → workflow → schedule            │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Capability Modules

```
┌─────────────────────────────────────────────────────────────┐
│                      Capabilities                           │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ ProviderCapability│  │ SkillCapability  │                │
│  │ 提供商切换/管理   │  │ 技能加载/匹配     │                │
│  └──────────────────┘  └──────────────────┘                 │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ ChatCapability   │  │ SubAgentCapability│                │
│  │ 单轮对话+流式    │  │ explore/plan/     │                │
│  │ 工具执行         │  │ general 子Agent   │                │
│  └──────────────────┘  └──────────────────┘                 │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │WorkflowCapability│  │SessionCapability │                │
│  │ 三阶段工作流     │  │ 会话持久化        │                │
│  │ analyzeTask()    │  │ SQLite存储        │                │
│  │ run(explore→     │  │                  │                │
│  │   plan→execute)  │  │                  │                │
│  └──────────────────┘  └──────────────────┘                 │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │TimeoutCapability │  │ScheduleCapability│                │
│  │ 心跳/超时/监控    │  │ 定时任务/推送通知  │                │
│  └──────────────────┘  └──────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

## LLM Runtime (自研运行时)

不依赖 `claude-agent-sdk`，基于 AI SDK (`@ai-sdk/openai`) 自研轻量运行时：

```
┌─────────────────────────────────────────────────────────┐
│                    LLMRuntime                          │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  AI SDK 标准接口                                 │   │
│  │  generateText() / streamText()                    │   │
│  │  + tool() + Zod schema (全 provider 兼容)         │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  AGENT_PRESETS                                   │   │
│  │  explore: { system, maxSteps: 5 }                │   │
│  │  plan:    { system, maxSteps: 10 }               │   │
│  │  general: { system, maxSteps: 20 }               │   │
│  │  (model 由 Provider 决定，不硬编码)                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  工具注入                                        │   │
│  │  直接接收 AI SDK Tool 格式 (无需 convertTools)    │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Provider Adapter System

OpenAI 兼容适配器支持国产 LLM（Chat Completions API）：

```
┌─────────────────────────────────────────────────────────┐
│                ProviderManager                          │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Anthropic │  │ OpenAI   │  │ Google   │  原生适配   │
│  │ Adapter  │  │ Adapter  │  │ Adapter  │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │        OpenAI Compatible Adapter                 │   │
│  │  ┌──────┐ ┌──────┐ ┌─────┐ ┌─────┐ ┌──────┐   │   │
│  │  │ GLM  │ │DeepSe│ │Qwen │ │Kimi │ │ ... │   │   │
│  │  │智谱   │ │ ek   │ │通义  │ │月之│ │     │   │   │
│  │  └──┬───┘ └──┬───┘ └──┬──┘ └──┬──┘ └──────┘   │   │
│  │     └───────┴─────────┴────────┴─────────┘      │   │
│  │        openai.chat(model)  ← Chat Completions    │   │
│  │        (非 Responses API)                         │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  ProviderRegistry (models.dev 动态加载)          │   │
│  │  baseUrl / defaultModel / envKeys / models       │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Built-in Tool System

统一工具系统，使用 AI SDK `tool()` + Zod schema，全 provider 兼容：

```
┌─────────────────────────────────────────────────────────┐
│                   ToolRegistry                          │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  工具注册 & 按 Agent 类型分配                      │   │
│  │  explore: file + glob + grep + web-search/fetch   │   │
│  │  plan:    file + glob + grep + web-search/fetch   │   │
│  │  general: 全部 7 个工具                            │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐       │
│  │bash    │ │file     │ │glob     │ │grep     │       │
│  │allowlist│ │路径约束  │ │深度限制  │ │原生匹配  │       │
│  │危险检查 │ │敏感文件  │ │路径约束  │ │路径约束  │       │
│  └─────────┘ └─────────┘ └─────────┘ └──────────┘       │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│  │web-search│ │web-fetch │ │ask-user  │                 │
│  │DuckDuckGo│ │SSRF防护  │ │用户确认   │                 │
│  │结果限制  │ │Markdown │ │          │                 │
│  └──────────┘ └──────────┘ └──────────┘                 │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  安全层 (security.ts)                            │   │
│  │  isPathAllowed / isPrivateIP / isCommandAllowed │   │
│  │  isDangerousCommand / isSensitiveFile            │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Dispatch Classification Flow

```
┌──────────────────────────────────────────────────┐
│                Dispatcher.dispatch()              │
└──────────────────┬───────────────────────────────┘
                   │
          ┌────────▼────────┐     ┌──────────────┐
          │ forceLayer?     │────►│ 直接路由      │
          │ (跳过分类)      │Yes  │ chat/workflow │
          └────────┬────────┘     └──────────────┘
                   │ No
          ┌────────▼────────┐
          │classifyForDispatch│
          │  LLM 分类        │
          │  (Provider默认模型)│
          └────────┬────────┘
                   │
            ┌──────▼──────┐
            │ confidence  │
            │  ≥ 0.5?     │
            └──┬──────┬───┘
          Yes │      │ No
             │      │
     ┌───────▼┐  ┌──▼────────────┐
     │ 使用LLM│  │ regexClassify │
     │ 结果   │  │ 关键词回退     │
     └───────┬┘  └──┬────────────┘
             │      │
             └──┬───┘
                │
          ┌─────▼──────┐
          │ 路由到对应层 │
          │ chat/workflow│
          └─────────────┘
```

## Server Layer

```
┌─────────────────────────────────────────────────────┐
│                   @bundy-lmw/hive-server                      │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐                  │
│  │  HTTP GW    │  │  WebSocket   │                  │
│  │  POST /chat │  │  /ws endpoint│                  │
│  │  API Key 鉴权│  │              │                  │
│  └──────┬──────┘  └──────┬───────┘                  │
│         │                │                          │
│         └───────┬────────┘                          │
│                 │                                    │
│          ┌──────▼──────┐     ┌───────────────────┐  │
│          │   Agent     │     │ ScheduleEngine    │  │
│          │  dispatch() │     │ cron/every/at     │  │
│          └─────────────┘     │ 推送通知          │  │
│                             └───────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │            HiveContext                        │   │
│  │  agent + bus + config + plugins              │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │  配置: hive.config.json                        │   │
│  │  server.port / provider.id / provider.apiKey   │   │
│  │  plugins / ...                                │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Orchestrator Layer

```
┌─────────────────────────────────────────────────────┐
│              @bundy-lmw/hive-orchestrator                      │
│                                                     │
│  ┌──────────────┐  ┌──────────────────┐             │
│  │  Scheduler   │  │   MessageBus     │             │
│  │  AgentPool   │  │  pub/sub 事件    │             │
│  │  任务调度     │  │  plugin:event   │             │
│  └──────┬───────┘  └──────────────────┘             │
│         │                                            │
│  ┌──────▼───────┐                                   │
│  │  PluginHost  │                                   │
│  │  插件生命周期 │                                   │
│  └──────────────┘                                   │
└─────────────────────────────────────────────────────┘
```

## Hooks System

```
┌─────────────────────────────────────────────────────┐
│                   HookRegistry                       │
│                                                     │
│  session:start ──► session:end ──► session:error     │
│  tool:before ──────────► tool:after                 │
│  capability:init ──► capability:dispose              │
│  workflow:phase (explore/plan/execute)              │
│  dispatch.classify ─► dispatch.route ─► dispatch.done│
└─────────────────────────────────────────────────────┘
```

## Data Flow

```
用户输入
   │
   ▼
Gateway (HTTP/WS)
   │  API Key 鉴权、CORS、错误隔离
   ▼
Agent.dispatch(task)
   │
   ├──► trace[0]: dispatch.start
   │
   ├──► Classifier (LLM / Regex)
   │      └──► trace[n]: dispatch.classify
   │
   ├──► Route Decision
   │      └──► trace[n]: dispatch.route
   │
   ├──► Execute Layer
   │      ├── chat:    ChatCapability → AgentRunner → LLMRuntime → AI SDK → Provider
   │      └── workflow: explore → plan → execute → LLMRuntime → AI SDK → Provider
   │
   └──► trace[last]: dispatch.complete
          │
          ▼
   DispatchResult
   ├── layer: 'chat' | 'workflow'
   ├── text: string
   ├── success: boolean
   ├── classification: { layer, taskType, complexity, confidence, reason }
   ├── trace: DispatchTraceEvent[]
   └── (workflow only): analysis, exploreResult, executionPlan, executeResult
```

## Key Design Decisions

1. **不硬编码模型**: Agent 预设和分类器不指定具体模型 ID，使用 Provider 的默认模型
2. **OpenAI 兼容**: 国产 LLM 统一使用 `openai.chat()` 走 Chat Completions API
3. **统一工具系统**: 使用 AI SDK 标准 `tool()` + Zod schema，所有 provider 兼容
4. **配置统一**: 使用 `hive.config.json` 替代 `.env`，一个文件管理所有配置
5. **安全层内置**: 路径约束、SSRF 防护、命令 allowlist、敏感文件保护在工具层实现
