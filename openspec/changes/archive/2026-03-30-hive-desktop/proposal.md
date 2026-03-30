## Why

Hive 当前只有命令行和 HTTP API 两种交互方式，缺少可视化界面。配置 Provider、安装插件、查看日志、管理 Skill 等操作都需要手动编辑 JSON 文件或执行命令，门槛高且不直观。首次启动时如果没有配置 API Key，Agent 无法正常工作，但用户没有友好的方式完成初始配置。

需要将 Hive 打包为跨平台桌面应用，提供可视化 GUI，同时通过 WebSocket 协议实现前后端实时通信。

## What Changes

- 新增 `apps/desktop/` 工程：Tauri 2.0 + React + Vite + shadcn/ui 桌面应用
- 新增 WebSocket 管理协议：前端与 Node 后端通过 WS 双向通信（req/res/event 三种消息类型）
- 新增 Admin WS Handler：在 `apps/server/src/gateway/` 下实现配置读写、服务状态、插件管理、日志流推送
- 新增进程级重启机制：Node sidecar 退出后 Tauri 自动重新拉起，前端自动重连
- 新增首次启动设置向导：检测 `providerReady` 状态，引导用户配置 Provider

## Capabilities

### New Capabilities
- `ws-management-protocol`: 前后端 WebSocket 通信协议，定义 req/res/event 消息格式、方法集、事件集、数据结构
- `admin-ws-handler`: 服务端 WS Handler 实现，处理配置管理、服务状态查询、插件安装/卸载、日志流推送
- `desktop-app`: Tauri 桌面应用工程，包含 React 前端、Rust 侧 sidecar 管理、WS 客户端、设置向导、日志页面等

### Modified Capabilities
- `server-factory`: 服务启动流程需支持 WS admin 端点挂载，以及 graceful shutdown 事件推送

## Impact

- `apps/server/src/gateway/` — 新增 `admin-ws.ts` WS handler
- `apps/server/src/main.ts` — 启动流程需挂载 WS admin 端点
- `apps/desktop/` — 新增整个桌面应用工程（Tauri + React）
- `pnpm-workspace.yaml` — 新增 `apps/desktop` workspace
- 依赖：`@tauri-apps/cli`、`@tauri-apps/api`、`react`、`vite`、`shadcn/ui`
- 现有 HTTP API (`/api/chat`, `/webhook/*`) 不变，WS admin 是新增的独立通信通道
