## MODIFIED Requirements

### Requirement: 发送飞书消息
系统 SHALL 能够向飞书用户或群组发送消息，包括文件和图片类型。文件路径 SHALL 从 `ChannelSendOptions.filePath` 读取。

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
- **WHEN** 系统调用 `send()` 且 `type` 为 `'file'`，`filePath` 包含本地文件路径
- **THEN** 系统 SHALL 先通过 `client.im.file.create()` 上传文件获取 `file_key`
- **AND** 再通过飞书消息 API 发送 `msg_type: 'file'` 消息

#### Scenario: 发送图片消息
- **WHEN** 系统调用 `send()` 且 `type` 为 `'image'`，`filePath` 包含本地图片路径
- **THEN** 系统 SHALL 先通过 `client.im.image.create()` 上传图片获取 `image_key`
- **AND** 再通过飞书消息 API 发送 `msg_type: 'image'` 消息

#### Scenario: 兼容 metadata.filePath
- **WHEN** `filePath` 未设置但 `metadata.filePath` 有值
- **THEN** 系统 SHALL 降级读取 `metadata.filePath`（向后兼容）
