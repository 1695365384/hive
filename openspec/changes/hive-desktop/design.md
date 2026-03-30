## Context

Hive 是一个多 Agent 协作框架，当前通过 `apps/server` 提供 HTTP + WebSocket 服务。现有架构：

- `apps/server` — Node.js 服务，使用 Hono 框架，挂载 HTTP API 和 WS 网关
- `@bundy-lmw/hive-core` — Agent 核心，包含 Provider 管理、Session、Skill、插件系统等
- 插件通过 `.hive/plugins/` 目录扫描或 npm 包动态加载
- 配置通过 `hive.config.json` 管理

桌面应用需要解决的核心问题：首次启动时 Agent 不可用（无 API Key），GUI 需要能在此时完成配置并触发服务重启。

## Goals / Non-Goals

**Goals:**
- 在 `apps/desktop/` 下创建 Tauri 2.0 + React 桌面应用
- 通过 WebSocket 协议实现前后端实时双向通信
- 实现配置管理、服务状态查询、插件管理、日志流推送的管理 API
- 支持进程级重启：Node sidecar 退出后 Tauri 自动重新拉起
- 首次启动引导用户完成 Provider 配置

**Non-Goals:**
- 不重写 `@bundy-lmw/hive-core` 任何逻辑
- 不替换现有 HTTP API（`/api/chat`、`/webhook/*` 保持不变）
- 不实现热重载（配置变更通过进程重启生效）
- 不做移动端适配（Tauri 2.0 mobile 暂不考虑）
- 不自建插件商店服务器（插件分发由 #41 issue 独立处理）
- 不实现 Skill 可视化编辑器（后续独立 change）

## Decisions

### D1: 通信协议选择 WebSocket

**选择**: 前后端通过 WebSocket 双向通信，不新增 REST API。

**替代方案**: 在现有 Hono 上新增 REST 管理端点。

**理由**:
- 桌面应用是长连接场景，WS 比 HTTP 更自然
- 实时日志流、状态变更推送需要服务端主动推送
- 统一协议（req/res/event）比 REST + SSE 混合更简洁
- 前端维护一个 WS 连接即可完成所有操作

### D2: 进程级重启（策略 A）

**选择**: 配置变更后 Node sidecar 进程退出，Tauri Rust 侧检测退出后重新 spawn。

**替代方案**: Node 侧实现热重载（修改 ProviderManager 后不重启进程）。

**理由**:
- 实现简单，不需要修改 `@bundy-lmw/hive-core` 的初始化逻辑
- 状态彻底重置，不会有残留问题
- 端口、插件等配置变更本身就需要重启才能完全生效
- 重启耗时 < 2 秒，用户感知可接受

### D3: Node sidecar 管理方式

**选择**: 开发阶段使用 Tauri spawn 系统 Node.js，生产阶段使用 Node SEA 打包。

**替代方案**: 打包完整 Node.js 运行时 + server dist/。

**理由**:
- 开发阶段最简单，不需要打包
- Node SEA 是 Node.js 官方方案，长期维护有保障
- 单文件分发，安装体验好
- 如果后续遇到原生模块兼容问题，可回退到完整 Node 方案

### D4: 前端技术栈

**选择**: React + Vite + shadcn/ui + Tailwind CSS。

**理由**:
- shadcn/ui 提供高质量组件（表单、表格、对话框、Toast），配置管理页和日志页可直接使用
- Vite 与现有 TypeScript 工程链兼容
- Tauri 官方模板支持 React + Vite

### D5: WS 消息协议格式

**选择**: 自定义 JSON 协议，三种消息类型（req / res / event）。

**协议结构**:
```
req:  { id, type: 'req', method, params, timestamp }
res:  { id, type: 'res', success, result | error, timestamp }
event:{ id, type: 'event', event, data, timestamp }
```

**理由**:
- 简洁，不需要引入 JSON-RPC 或 GraphQL over WS 的复杂性
- id 字段支持请求/响应匹配
- event 类型支持服务端主动推送（日志、状态变更）

### D6: WS Admin 端点路径

**选择**: `/ws/admin`，独立于现有 WS 网关。

**理由**:
- 现有 WS 网关 (`/ws`) 用于插件 channel 通信
- admin WS 有独立的认证和消息协议
- 物理隔离，互不影响

## Risks / Trade-offs

**[Node SEA 原生模块兼容性]** → `better-sqlite3` 和 `@larksuiteoapi/node-sdk` 可能包含原生绑定。如果 Node SEA 不兼容，回退到打包完整 Node.js 二进制。

**[端口冲突]** → 如果 4450 被占用，sidecar 启动失败。→ Rust 侧实现端口探测（尝试 4450-4460），将实际端口写入临时文件告知前端。

**[WS 断连期间状态丢失]** → 重启期间 WS 断开，前端无法获取实时状态。→ Rust 侧维护 sidecar 进程状态，通过 Tauri IPC 告知前端当前处于 `reconnecting`。

**[日志内存占用]** → 如果日志不做限制，长时间运行会占用大量内存。→ 服务端维护固定大小的环形缓冲区（默认 10000 条），超过自动淘汰旧日志。

**[Tauri 开发环境复杂度]** → 开发需要 Rust + Node.js 双环境。→ 提供 `pnpm dev` 一键启动（concurrently 运行 tauri dev + server build）。

## Open Questions

- Node SEA 是否支持 `better-sqlite3`？需要 spike 验证。
- 日志是否需要持久化到文件（`~/.hive/logs/`），还是仅内存缓冲？
- 插件安装是否需要 progress 通知（npm install 进度）？
