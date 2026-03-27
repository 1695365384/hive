## 1. 项目初始化

- [x] 1.1 创建 `packages/orchestrator` 目录结构
- [x] 1.2 初始化 `package.json`，设置 `@hive/orchestrator` 包名
- [x] 1.3 配置 `tsconfig.json`，依赖 `@hive/core`
- [x] 1.4 创建 `src/index.ts` 导出公开 API
- [x] 1.5 编写单元测试框架配置

## 2. 消息总线 (MessageBus)

- [x] 2.1 定义消息类型 `src/bus/types.ts`
- [x] 2.2 实现 `MessageBus` 核心类，基于 EventEmitter
- [x] 2.3 实现发布/订阅模式 (`subscribe`, `unsubscribe`, `publish`)
- [x] 2.4 实现请求/响应模式 (`request`, `respond`)
- [x] 2.5 实现广播模式 (`broadcast`)
- [x] 2.6 实现通配符订阅 (`agent:*`)
- [x] 2.7 添加中间件支持 (`use`)
- [x] 2.8 编写 MessageBus 单元测试

## 3. Agent 调度器 (Scheduler)

- [x] 3.1 定义调度器接口 `src/scheduler/types.ts`
- [x] 3.2 实现 `AgentPool` 实例池管理
- [x] 3.3 实现 `Scheduler.register()` 注册 Agent
- [x] 3.4 实现 `Scheduler.unregister()` 注销 Agent
- [x] 3.5 实现 `Scheduler.dispatch()` 消息路由
- [x] 3.6 实现 `Scheduler.broadcast()` 广播
- [x] 3.7 实现 Agent 状态管理（idle/busy/error）
- [x] 3.8 编写 Scheduler 单元测试

## 4. 插件系统 (PluginHost)

- [x] 4.1 定义插件接口 `src/plugins/types.ts`
- [x] 4.2 实现 `PluginHost` 插件宿主
- [x] 4.3 实现插件加载 (`load`)
- [x] 4.4 实现插件生命周期 (`init`, `destroy`)
- [x] 4.5 实现插件启用/禁用 (`enable`, `disable`)
- [x] 4.6 实现消息钩子 (`onMessage`)
- [x] 4.7 实现依赖检查
- [ ] 4.8 编写 PluginHost 单元测试

## 5. 飞书插件初始化

- [x] 5.1 创建 `packages/plugins/feishu` 目录结构
- [x] 5.2 初始化 `package.json`，设置 `@hive/plugin-feishu` 包名
- [x] 5.3 配置 `tsconfig.json`，依赖 `@hive/orchestrator`
- [x] 5.4 创建 `src/index.ts` 导出插件

## 6. 飞书 WebSocket 客户端

- [ ] 6.1 实现 WebSocket 连接管理
- [ ] 6.2 实现身份验证（App ID/Secret）
- [ ] 6.3 实现心跳保活
- [ ] 6.4 实现断线重连（指数退避）
- [ ] 6.5 实现消息接收和解析
- [ ] 6.6 实现消息发送
- [ ] 6.7 编写客户端单元测试

## 7. 飞书消息适配器

- [ ] 7.1 定义飞书消息类型 `src/types.ts`
- [ ] 7.2 实现 `transformIncoming` 飞书消息 → AgentMessage
- [ ] 7.3 实现 `transformOutgoing` AgentMessage → 飞书消息
- [ ] 7.4 处理消息类型映射（文本、图片、卡片等）
- [ ] 7.5 编写适配器单元测试

## 8. 飞书插件集成

- [ ] 8.1 实现 `FeishuPlugin` 类，实现 `PlatformAdapter` 接口
- [ ] 8.2 实现 `init` 初始化连接
- [ ] 8.3 实现 `destroy` 清理资源
- [ ] 8.4 实现消息钩子，转发到消息总线
- [ ] 8.5 编写集成测试

## 9. 集成与文档

- [x] 9.1 编写 orchestrator README.md
- [x] 9.2 编写 plugin-feishu README.md
- [x] 9.3 编写使用示例
- [x] 9.4 添加到 monorepo 构建流程
- [ ] 9.5 端到端测试（飞书机器人实际交互）
