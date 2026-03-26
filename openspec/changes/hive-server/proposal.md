## Why

Hive 框架目前只有核心库（core、orchestrator、openclaw-adapter），缺少应用入口和网关层，无法端到端运行。需要创建一个可运行的服务器应用，整合所有模块，加载 OpenClaw 插件（如 @larksuite/openclaw-lark），并通过多通道网关（HTTP/WebSocket/CLI）暴露 Agent 能力，实现完整的端到端验证。

## What Changes

- 创建 `apps/server` 包作为 Hive 的主应用入口
- 实现 HTTP 网关（基于 Hono）提供 REST API
- 实现 WebSocket 网关支持实时双向通信
- 实现 CLI 入口支持命令行交互
- 整合 `@hive/core`、`@hive/orchestrator`、`@hive/openclaw-adapter`
- 支持 OpenClaw 插件加载（通过适配器）
- 提供统一的启动配置和生命周期管理

## Capabilities

### New Capabilities

- `http-gateway`: HTTP REST API 网关，提供聊天、会话管理、插件管理等接口
- `websocket-gateway`: WebSocket 实时通信网关，支持流式响应和事件推送
- `cli-entry`: 命令行入口，支持交互式聊天和服务器启动
- `plugin-integration`: 插件集成系统，连接 openclaw-adapter 和 orchestrator

### Modified Capabilities

（无现有 capability 需要修改）

## Impact

**新增代码：**
- `apps/server/` - 新的应用包
- `apps/server/src/gateway/` - HTTP/WebSocket 网关
- `apps/server/src/cli/` - CLI 入口
- `apps/server/src/bootstrap.ts` - 启动逻辑

**依赖关系：**
- 依赖 `@hive/core`（Agent、Session、Storage）
- 依赖 `@hive/orchestrator`（MessageBus、Scheduler、PluginHost）
- 依赖 `@hive/openclaw-adapter`（OpenClaw 插件加载）
- 新增 `hono` 作为 HTTP 框架
- 新增 `ws` 或原生 WebSocket

**配置文件：**
- `pnpm-workspace.yaml` 需要添加 `apps/*`
