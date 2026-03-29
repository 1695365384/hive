## MODIFIED Requirements

### Requirement: 接收飞书消息事件
系统 SHALL 通过飞书事件订阅接收用户发送给机器人的消息，包括文件和图片类型。

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

#### Scenario: 接收文件消息
- **WHEN** 飞书用户向机器人发送文件（`message_type` 为 `file`、`audio`、`media`）
- **THEN** 系统 SHALL 自动下载文件到 workspace 目录
- **AND** 发布的消息中 `content` SHALL 包含本地文件路径
- **AND** `type` SHALL 为 `'file'`

#### Scenario: 接收图片消息
- **WHEN** 飞书用户向机器人发送图片（`message_type` 为 `image`）
- **THEN** 系统 SHALL 自动下载图片到 workspace 目录
- **AND** 发布的消息中 `content` SHALL 包含本地文件路径
- **AND** `type` SHALL 为 `'image'`

## MODIFIED Requirements

### Requirement: 发送飞书消息
系统 SHALL 能够向飞书用户或群组发送消息，包括文件和图片类型。

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

#### Scenario: 发送文件消息
- **WHEN** 系统调用 `send()` 且 `type` 为 `'file'`，`metadata.filePath` 包含本地文件路径
- **THEN** 系统 SHALL 先通过 `client.im.file.create()` 上传文件获取 `file_key`
- **AND** 再通过飞书消息 API 发送 `msg_type: 'file'` 消息

#### Scenario: 发送图片消息
- **WHEN** 系统调用 `send()` 且 `type` 为 `'image'`，`metadata.filePath` 包含本地图片路径
- **THEN** 系统 SHALL 先通过 `client.im.image.create()` 上传图片获取 `image_key`
- **AND** 再通过飞书消息 API 发送 `msg_type: 'image'` 消息
