## 1. 基础设施

- [x] 1.1 创建 `handlers/` 目录结构
- [x] 1.2 实现 `handler-context.ts` — HandlerContext 接口定义
- [x] 1.3 实现 `handlers/base.ts` — WsDomainHandler 抽象基类

## 2. Domain Handlers 拆分

- [x] 2.1 实现 `handlers/config-handler.ts` — config.get / config.update / config.getProviderPresets
- [x] 2.2 实现 `handlers/status-handler.ts` — status.get / server.restart / server.getProviders / provider.list / provider.getModels
- [x] 2.3 实现 `handlers/plugin-handler.ts` — plugin.list / plugin.available / plugin.install / plugin.uninstall / plugin.updateConfig（含 reloadPlugin）
- [x] 2.4 实现 `handlers/log-handler.ts` — log.getHistory / log.tail / log.listDates / log.getByDate / log.subscribe / log.unsubscribe
- [x] 2.5 实现 `handlers/session-handler.ts` — session.list / session.get / session.delete
- [x] 2.6 实现 `handlers/index.ts` — 导出所有 Domain Handler 及创建函数

## 3. ChatWsHandler 独立

- [x] 3.1 实现 `chat-handler.ts` — ChatWsHandler 类，包含 chat.send、runAgentChat、threadId 映射管理
- [x] 3.2 实现 Agent Hook 订阅逻辑（从 admin-handler 迁移 subscribeAgentHooks / unsubscribeAgentHooks）

## 4. AdminWsHandler 瘦身

- [x] 4.1 重构 `admin-handler.ts` 为薄 Router — 仅保留 handleConnection、closeAll、消息路由、HandlerContext 构建
- [x] 4.2 从 admin-handler.ts 中移除所有业务 handler 方法、reloadPlugin、Agent Hook 订阅
- [x] 4.3 从 admin-handler.ts 中移除 chat.send 相关代码

## 5. 路由注册

- [x] 5.1 在 gateway 路由中注册 `/ws/chat` 端点，使用 ChatWsHandler
- [x] 5.2 从 `/ws/admin` 路由中移除 chat.send handler

## 6. 测试

- [x] 6.1 重构 `admin-handler.test.ts`，适配新的 HandlerContext 注入方式
- [x] 6.2 新增 `config-handler.test.ts` 单元测试
- [x] 6.3 新增 `status-handler.test.ts` 单元测试
- [x] 6.4 新增 `plugin-handler.test.ts` 单元测试
- [x] 6.5 新增 `log-handler.test.ts` 单元测试
- [x] 6.6 新增 `session-handler.test.ts` 单元测试
- [x] 6.7 新增 `chat-handler.test.ts` 单元测试
- [x] 6.8 运行全部测试，确保 956+ 用例通过

## 7. 验证

- [x] 7.1 确认 admin-handler.ts 不超过 200 行
- [x] 7.2 确认所有 Domain Handler 文件不超过 200 行
- [x] 7.3 确认 npm run build 编译通过
