## ADDED Requirements

### Requirement: Tauri project structure
系统 SHALL 在 `apps/desktop/` 下创建 Tauri 2.0 项目，结构如下：

```
apps/desktop/
├── src-tauri/           # Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/main.rs      # 窗口、系统托盘、sidecar 管理
│   └── binaries/        # sidecar 二进制（生产打包时放入）
├── src/                 # React 前端
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/           # 页面组件
│   ├── components/      # 通用组件
│   ├── hooks/           # 自定义 hooks
│   └── lib/             # 工具函数
├── package.json         # @bundy-lmw/hive-desktop
├── vite.config.ts
└── tsconfig.json
```

#### Scenario: pnpm workspace recognition
- **WHEN** `pnpm install` 执行
- **THEN** `apps/desktop` 被识别为 workspace 成员

### Requirement: Sidecar lifecycle management
Tauri Rust 侧 SHALL 管理 Node.js sidecar 的完整生命周期：spawn、健康检查、重启、退出。

#### Scenario: Start sidecar on app launch
- **WHEN** Tauri 应用启动
- **THEN** Rust 侧 spawn Node.js sidecar（开发阶段: `node ../../server/dist/main.js`）
- **THEN** 轮询 `http://localhost:4450/health` 直到返回 200
- **THEN** 通过 Tauri event 通知 WebView sidecar 就绪

#### Scenario: Restart sidecar
- **WHEN** sidecar 进程退出（正常退出或崩溃）
- **THEN** Rust 侧等待 500ms 后重新 spawn
- **THEN** 重新轮询 `/health` 直到就绪

#### Scenario: Max restart attempts
- **WHEN** sidecar 连续崩溃超过 5 次（1 分钟内）
- **THEN** 停止自动重启，通知 WebView 进入 `failed` 状态

### Requirement: WS client
前端 SHALL 实现一个 WS 客户端，管理与后端的 WebSocket 连接。

WS 客户端 SHALL 封装 req/res 模式，对外暴露 Promise-based API。

#### Scenario: Send request and receive response
- **WHEN** 调用 `wsClient.request('config.get')`
- **THEN** 发送 `{ type: 'req', method: 'config.get' }`
- **THEN** 返回 Promise，收到匹配 id 的 res 后 resolve

#### Scenario: Event listener
- **WHEN** 调用 `wsClient.on('log', callback)`
- **THEN** 后续收到的 `event: log` 消息触发 callback

#### Scenario: Connection states
- **WHEN** WS 连接状态变化
- **THEN** 对外暴露 `connected`、`reconnecting`、`failed` 三种状态

### Requirement: Auto reconnection
WS 客户端 SHALL 在连接断开后自动重连，使用指数退避策略。

#### Scenario: Reconnect after disconnect
- **WHEN** WS 连接断开（sidecar 重启）
- **THEN** 500ms 后尝试重连
- **THEN** 失败则 1000ms 后重试，以此类推（最大间隔 30s）
- **THEN** 重连成功后恢复所有 event 订阅（重新发送 `log.subscribe` 等）

### Requirement: Setup wizard page
应用 SHALL 在首次启动且 `providerReady === false` 时显示设置向导页面。

#### Scenario: Show setup wizard
- **WHEN** 应用启动并连接 WS 后
- **THEN** 调用 `status.get`
- **THEN** 如果 `agent.providerReady === false`，显示设置向导

#### Scenario: Setup wizard flow
- **WHEN** 用户在设置向导中选择 Provider 并输入 API Key
- **THEN** 调用 `config.update` 写入配置
- **THEN** 调用 `server.restart` 重启服务
- **THEN** 等待重连成功后再次检查 `providerReady`
- **THEN** 如果为 true，跳转到主界面

### Requirement: Config management page
应用 SHALL 提供配置管理页面，支持查看和修改 Provider、服务器设置、认证、心跳配置。

#### Scenario: Display current config
- **WHEN** 用户进入配置页
- **THEN** 调用 `config.get` 获取当前配置并展示

#### Scenario: Update provider
- **WHEN** 用户修改 Provider（id / apiKey / model）并保存
- **THEN** 调用 `config.update` 更新配置
- **THEN** 弹出确认对话框询问是否重启
- **THEN** 用户确认后调用 `server.restart`

### Requirement: Log viewer page
应用 SHALL 提供日志查看页面，支持实时日志流和历史日志查询。

#### Scenario: Real-time log streaming
- **WHEN** 用户进入日志页
- **THEN** 调用 `log.subscribe` 开启实时推送
- **THEN** 新日志自动追加到列表底部（自动滚动）

#### Scenario: Log level filtering
- **WHEN** 用户选择 "仅显示 Error"
- **THEN** 仅显示 level 为 error 的日志

#### Scenario: Keyword search
- **WHEN** 用户在搜索框输入 "failed"
- **THEN** 实时过滤显示包含 "failed" 的日志

#### Scenario: Pause auto-scroll
- **WHEN** 用户向上滚动查看历史日志
- **THEN** 自动滚动暂停
- **THEN** 用户滚动到底部时恢复自动滚动

### Requirement: Plugin management page
应用 SHALL 提供插件管理页面，展示已安装插件列表和安装/卸载操作。

#### Scenario: List installed plugins
- **WHEN** 用户进入插件页
- **THEN** 调用 `plugin.list` 展示已安装插件

#### Scenario: Install plugin
- **WHEN** 用户输入插件来源（npm 包名 / Git URL）并点击安装
- **THEN** 调用 `plugin.install`
- **THEN** 显示安装进度和结果

### Requirement: System tray integration
应用 SHALL 注册系统托盘图标，提供快捷菜单。

#### Scenario: Tray menu
- **WHEN** 用户点击系统托盘图标
- **THEN** 显示菜单：显示窗口、重启服务、退出

#### Scenario: Tray notification
- **WHEN** 服务重启完成
- **THEN** 通过系统通知告知用户

### Requirement: Development workflow
应用 SHALL 提供 `pnpm dev` 一键启动开发环境（Tauri dev + Node server watch）。

#### Scenario: Dev mode startup
- **WHEN** 在 `apps/desktop` 目录执行 `pnpm dev`
- **THEN** 同时启动 Vite 前端 dev server 和 Tauri dev（Tauri spawn 系统 Node.js 运行 server）
