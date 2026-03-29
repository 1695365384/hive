# Hive Architecture

## Monorepo Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          hive/ (pnpm workspace)                     │
│                                                                     │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │ apps/server  │  │ packages/core    │  │ packages/orchestrator │  │
│  │ @hive/server │  │ @hive/core       │  │ @hive/orchestrator   │  │
│  └──────┬───────┘  └───────┬──────────┘  └───────────┬───────────┘  │
│         │                  │                         │              │
│  ┌──────┴──────────────────┴─────────────────────────┴───────────┐  │
│  │                packages/plugins/feishu                        │  │
│  │                @hive/plugin-feishu                            │  │
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
                 │         │    (Haiku/只读)  │
                 │         ├─────────────────┤
                 │         │ 2. plan         │
                 │         │   (继承/只读)    │
                 │         ├─────────────────┤
                 │         │ 3. execute      │
                 │         │  (继承/全工具)   │
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
                  │ claude-agent-  │
                  │    sdk         │
                  └───────┬────────┘
                          │
              ┌───────────▼───────────┐
              │   LLM Provider       │
              │ (Anthropic/国产/自定义)│
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
│  │  │SkillRegistry │ │AgentRegistry│ │TimeoutCap     │  │   │
│  │  └──────────────┘ └────────────┘ └───────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Capability Registry                     │    │
│  │  初始化顺序: session → provider → skill → chat →    │    │
│  │            subAgent → workflow                      │    │
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
│  │ 工具钩子         │  │ general 子Agent   │                │
│  └──────────────────┘  └──────────────────┘                 │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │WorkflowCapability│  │SessionCapability │                 │
│  │ 三阶段工作流     │  │ 会话持久化        │                │
│  │ analyzeTask()    │  │ SQLite存储        │                │
│  │ run(explore→     │  │                  │                │
│  │   plan→execute)  │  │                  │                │
│  └──────────────────┘  └──────────────────┘                 │
│                                                             │
│  ┌──────────────────┐                                       │
│  │TimeoutCapability │                                       │
│  │ 心跳/超时/监控    │                                       │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
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
│                   @hive/server                      │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐                  │
│  │  HTTP GW    │  │  WebSocket   │                  │
│  │  POST /chat │  │  /ws endpoint│                  │
│  └──────┬──────┘  └──────┬───────┘                  │
│         │                │                          │
│         └───────┬────────┘                          │
│                 │                                    │
│          ┌──────▼──────┐     ┌───────────────────┐  │
│          │   Agent     │     │ HeartbeatScheduler│  │
│          │  dispatch() │     │ 周期性心跳巡检     │  │
│          └─────────────┘     └───────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │            HiveContext                        │   │
│  │  agent + bus + config + plugins              │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Orchestrator Layer

```
┌─────────────────────────────────────────────────────┐
│              @hive/orchestrator                      │
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
   │  输入验证、CORS、错误隔离
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
   │      ├── chat:    ChatCapability → AgentRunner → LLM
   │      └── workflow: explore → plan → execute → LLM
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
