## Context

Hive 是一个多 Agent 协作框架，目前包含：
- `@hive/core`：Agent 核心、会话管理、存储、技能系统
- `@hive/orchestrator`：MessageBus、Scheduler、PluginHost
- `@hive/openclaw-adapter`：OpenClaw 插件兼容层

缺少的是**应用入口层**，无法端到端运行。本设计目标是创建一个统一的服务器应用，整合所有模块，并提供多通道访问能力。

**技术约束：**
- Node.js 18+，ESM 模块
- pnpm monorepo 结构
- TypeScript 5.3+
- 复用现有模块，不重复造轮子

## Goals / Non-Goals

**Goals:**
- 创建可运行的服务器应用入口
- HTTP 网关提供 REST API（聊天、会话、插件管理）
- WebSocket 网关支持实时流式通信
- CLI 入口支持交互式聊天
- 整合 openclaw-adapter 加载 OpenClaw 插件
- 统一的启动配置和生命周期管理

**Non-Goals:**
- 不实现认证/授权（后续迭代）
- 不实现分布式部署（单机版优先）
- 不实现持久化消息队列（使用内存 MessageBus）
- 不实现前端 UI

## Decisions

### D1: 使用 Hono 作为 HTTP 框架

**选择：** Hono（而非 Express/Fastify）

**理由：**
- 轻量级（~14KB），零依赖
- 原生 TypeScript 支持
- 标准Web API 兼容（Request/Response）
- 内置路由、中间件、错误处理
- 可部署到多种运行时（Node/Bun/Deno/Edge）

**替代方案：**
- Express：生态成熟但较重，TypeScript 支持不佳
- Fastify：性能好但生态较小

### D2: 使用原生 WebSocket（Node.js 内置）

**选择：** 原生 `WebSocket` API（Node.js 22+ 内置）

**理由：**
- 无额外依赖
- 与 Hono 集成简单
- 满足实时通信需求

**替代方案：**
- `ws` 库：功能丰富但 Node 22+ 已内置 WebSocket
- Socket.io：功能强大但较重，不需要兼容性层

### D3: 应用架构 - 模块化分层

**选择：** 三层架构（Gateway → Orchestrator → Core）

```
┌─────────────────────────────────────────────┐
│  Gateway Layer (HTTP/WS/CLI)                │
│  - 路由、协议转换、请求验证                    │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│  Orchestrator Layer                          │
│  - MessageBus、Scheduler、PluginHost         │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│  Core Layer (@hive/core)                     │
│  - Agent、Session、Storage、Skills           │
└─────────────────────────────────────────────┘
```

**理由：**
- 清晰的职责分离
- 便于测试（每层可独立 mock）
- 复用现有模块

### D4: 配置方式 - 环境变量 + 配置文件

**选择：** 优先环境变量，支持 `.env` 文件

**理由：**
- 12-Factor App 原则
- 便于容器化部署
- 开发时可用 `.env` 文件

### D5: 插件加载策略

**选择：** 启动时加载，显式配置插件列表

**理由：**
- 简单可控
- 便于调试
- 避免动态加载的安全风险

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| OpenClaw 插件 ESM/CJS 兼容性问题 | openclaw-adapter 已处理，提供 fallback |
| WebSocket 连接管理复杂 | 使用简单的连接池，后续可升级 |
| 缺少认证机制 | 明确为 Non-Goal，后续迭代 |
| 单机内存 MessageBus 限制 | 明确为 Non-Goal，后续可升级 Redis |

## Architecture Overview

```
apps/server/
├── src/
│   ├── main.ts              # 入口点
│   ├── bootstrap.ts         # 启动逻辑
│   ├── gateway/
│   │   ├── http.ts          # Hono HTTP 服务
│   │   ├── websocket.ts     # WebSocket 服务
│   │   └── routes/
│   │       ├── chat.ts      # 聊天 API
│   │       ├── session.ts   # 会话 API
│   │       └── plugin.ts    # 插件 API
│   ├── cli/
│   │   └── index.ts         # CLI 入口
│   └── config.ts            # 配置管理
├── package.json
└── tsconfig.json
```

## Open Questions

1. **端口配置：** 默认 HTTP 端口 3000，WebSocket 共用还是独立端口？（倾向共用）
2. **插件配置文件格式：** JSON 还是 YAML？（倾向 JSON，与现有配置一致）
3. **CLI 交互模式：** readline 还是 inquirer？（倾向 readline，减少依赖）
