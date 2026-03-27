# feishu-channel Specification

## Purpose
TBD - created by archiving change feishu-channel-plugin. Update Purpose after archive.
## Requirements
### Requirement: 接收飞书消息事件

系统 SHALL 通过飞书事件订阅接收用户发送给机器人的消息。

#### Scenario: 接收文本消息
- **WHEN** 飞书用户向机器人发送文本消息
- **THEN** 系统 SHALL 解析事件并发布 `message:received` 事件到消息总线
- **AND** 事件载荷 SHALL 包含 `content`, `from`, `chatId`, `messageType`

#### Scenario: 处理飞书签名验证
- **WHEN** 飞书服务器发送事件回调请求
- **THEN** 系统 SHALL 验证请求签名以确保请求来自飞书

#### Scenario: 响应飞书 Challenge
- **WHEN** 飞书发送 URL 验证 Challenge 请求
- **THEN** 系统 SHALL 返回正确的 Challenge 响应

### Requirement: 发送飞书消息

系统 SHALL 能够向飞书用户或群组发送消息。

#### Scenario: 发送文本消息
- **WHEN** 系统调用 `sendMessage` 方法发送文本
- **THEN** 系统 SHALL 通过飞书 API 发送消息
- **AND** 返回消息 ID

#### Scenario: 发送富文本消息
- **WHEN** 系统调用 `sendMessage` 方法发送富文本（卡片、Markdown）
- **THEN** 系统 SHALL 构建对应格式并通过飞书 API 发送

#### Scenario: 回复消息
- **WHEN** 系统调用 `replyMessage` 方法回复特定消息
- **THEN** 系统 SHALL 使用飞书消息回复 API

### Requirement: 多租户支持

系统 SHALL 支持同时运行多个飞书应用实例。

#### Scenario: 配置多个飞书应用
- **WHEN** 配置中包含多个飞书应用的凭证
- **THEN** 系统 SHALL 为每个应用创建独立的客户端实例
- **AND** 消息事件 SHALL 包含 `appId` 标识来源应用

### Requirement: 错误处理与重试

系统 SHALL 妥善处理飞书 API 错误。

#### Scenario: API 限流处理
- **WHEN** 飞书 API 返回限流错误
- **THEN** 系统 SHALL 实现指数退避重试

#### Scenario: Token 过期刷新
- **WHEN** 飞书 access_token 过期
- **THEN** 系统 SHALL 自动刷新 token 并重试请求

