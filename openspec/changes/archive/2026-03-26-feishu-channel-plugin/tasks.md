## 1. 插件接口定义

- [x] 1.1 在 `@hive/core` 中定义 `IPlugin` 接口（生命周期方法）
- [x] 1.2 在 `@hive/core` 中定义 `IChannel` 接口（send, id, type）
- [x] 1.3 在 `@hive/core` 中定义 `PluginContext` 类型
- [x] 1.4 导出接口类型

## 2. 飞书插件包初始化

- [x] 2.1 创建 `packages/plugins/feishu/` 目录结构
- [x] 2.2 创建 `package.json`（依赖 @larksuiteoapi/node-sdk）
- [x] 2.3 创建 `tsconfig.json`
- [x] 2.4 更新 `pnpm-workspace.yaml` 包含插件目录

## 3. 飞书通道实现

- [x] 3.1 实现 `FeishuChannel` 类（实现 IChannel）
- [x] 3.2 实现消息发送方法（文本、卡片）
- [x] 3.3 实现消息格式转换（飞书格式 → 通用格式）
- [x] 3.4 实现 Token 自动刷新（由 SDK 处理）

## 4. Webhook 处理

- [x] 4.1 实现飞书签名验证中间件
- [x] 4.2 实现 Challenge 响应处理
- [x] 4.3 实现事件解析和分发
- [x] 4.4 发布消息事件到 MessageBus

## 5. 插件主类

- [x] 5.1 实现 `FeishuPlugin` 类（实现 IPlugin）
- [x] 5.2 实现多租户配置加载
- [x] 5.3 实现插件初始化和激活
- [x] 5.4 实现插件停用和清理

## 6. Server 集成

- [x] 6.1 在 `apps/server` 中实现插件加载器
- [x] 6.2 添加 Webhook 路由（`/webhook/feishu/:appId`）
- [x] 6.3 更新配置类型支持插件配置

## 7. 测试

- [x] 7.1 编写 FeishuChannel 单元测试
- [x] 7.2 编写签名验证测试
- [x] 7.3 编写消息格式转换测试
- [x] 7.4 编写集成测试（模拟飞书回调）

## 8. 文档

- [x] 8.1 编写插件 README
- [x] 8.2 添加配置示例
- [x] 8.3 更新 Server README
