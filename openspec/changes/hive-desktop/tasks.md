## 1. WS 协议类型定义

- [x] 1.1 创建 `apps/server/src/gateway/ws/types.ts`，定义 WsMessage / WsRequest / WsResponse / WsEvent 类型
- [x] 1.2 创建 `apps/server/src/gateway/ws/data-types.ts`，定义 ServerConfig / ServerStatus / PluginInfo / LogEntry / ProviderPresetInfo 等数据结构

## 2. Admin WS Handler

- [x] 2.1 创建 `apps/server/src/gateway/ws/admin-handler.ts`，实现 WS 连接管理和消息路由框架（req → handler → res）
- [x] 2.2 实现 config handler（config.get / config.update / config.getProviderPresets），包含 apiKey 脱敏和 hive.config.json 读写
- [x] 2.3 实现 status handler（status.get），包含 providerReady 检测和系统信息采集
- [x] 2.4 实现 server.restart handler，包含 shutting_down 事件推送和延迟退出
- [x] 2.5 实现 plugin handler（plugin.list / plugin.install / plugin.uninstall / plugin.updateConfig），包含 npm install 和 git clone 逻辑
- [x] 2.6 实现日志系统：console 拦截器 + 环形缓冲区 + log.getHistory / log.subscribe / log.unsubscribe
- [x] 2.7 实现 session handler（session.list / session.get / session.delete）
- [x] 2.8 实现 event 推送机制：server.shutting_down / log / plugin.installed / config.changed

## 3. Server 集成

- [x] 3.1 在 `apps/server/src/main.ts` 中挂载 `/ws/admin` 端点，使用 Hono 的 WS 支持
- [x] 3.2 修改 `server.stop()` 逻辑，关闭前广播 shutting_down 事件到所有 admin WS 连接
- [ ] 3.3 添加 admin WS handler 的单元测试

## 4. Tauri 桌面工程初始化

- [x] 4.1 使用 `pnpm create tauri-app` 初始化 `apps/desktop/` 工程（React + Vite + TypeScript）
- [x] 4.2 安装前端依赖：shadcn/ui、tailwindcss、@tanstack/react-query
- [x] 4.3 配置 `vite.config.ts`（开发代理到 localhost:4450）
- [x] 4.4 更新 `pnpm-workspace.yaml` 确保 `apps/desktop` 被识别
- [x] 4.5 配置 Tauri `tauri.conf.json`（窗口标题、尺寸、sidecar 声明）

## 5. Rust Sidecar 管理

- [ ] 5.1 实现 sidecar spawn 逻辑（开发模式：spawn 系统 node；生产模式：spawn sidecar 二进制）
- [ ] 5.2 实现健康检查轮询（poll /health 直到就绪）
- [ ] 5.3 实现进程退出检测和自动重启（500ms 延迟，最大 5 次连续重启）
- [ ] 5.4 通过 Tauri event 通知 WebView sidecar 状态变化

## 6. 前端 WS 客户端

- [x] 6.1 创建 `src/lib/ws-client.ts`，封装 WebSocket 连接管理
- [x] 6.2 实现 req/res 模式（Promise-based request 方法，30s 超时）
- [x] 6.3 实现 event 监听机制（on/off 方法）
- [x] 6.4 实现自动重连（指数退避，最大 30s，重连后恢复订阅）
- [x] 6.5 暴露连接状态（connected / reconnecting / failed）

## 7. 前端页面

- [x] 7.1 创建 App 布局（侧边栏导航 + 内容区），使用 shadcn/ui 组件
- [x] 7.2 实现设置向导页面（Provider 选择 + API Key 输入 + 模型选择）
- [x] 7.3 实现配置管理页面（Provider / 服务器 / 认证 / 心跳配置表单）
- [x] 7.4 实现日志查看页面（实时流 + 级别过滤 + 关键词搜索 + 自动滚动/暂停）
- [x] 7.5 实现插件管理页面（已安装列表 + 安装/卸载 + 配置编辑）
- [x] 7.6 实现服务状态页面（运行状态 / Provider 状态 / 系统资源监控）

## 8. 系统集成

- [ ] 8.1 实现系统托盘图标和快捷菜单（显示窗口 / 重启服务 / 退出）
- [ ] 8.2 实现系统通知（服务重启完成 / 插件安装完成 / 错误告警）
- [ ] 8.3 配置 `pnpm dev` 一键启动脚本（concurrently 运行 server build + tauri dev）
