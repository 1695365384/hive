## ADDED Requirements

### Requirement: 发送文件消息

FeishuChannel SHALL 支持通过飞书 API 发送文件消息。

#### Scenario: 发送普通文件
- **WHEN** 调用 `send()` 且 `type` 为 `'file'`，`metadata.filePath` 包含本地文件路径
- **THEN** 系统 SHALL 使用 `client.im.file.create()` 上传文件
- **AND** 使用返回的 `file_key` 通过 `client.im.v1.message.create()` 发送 `msg_type: 'file'` 消息
- **AND** 返回 `success: true` 和消息 ID

#### Scenario: 发送图片
- **WHEN** 调用 `send()` 且 `type` 为 `'image'`，`metadata.filePath` 包含本地图片路径
- **THEN** 系统 SHALL 使用 `client.im.image.create()` 上传图片（`image_type: 'message'`）
- **AND** 使用返回的 `image_key` 通过 `client.im.v1.message.create()` 发送 `msg_type: 'image'` 消息
- **AND** 返回 `success: true` 和消息 ID

#### Scenario: 文件路径无效
- **WHEN** `metadata.filePath` 指向不存在的文件
- **THEN** 系统 SHALL 返回 `success: false` 和错误信息
- **AND** 不调用飞书 API

#### Scenario: 文件类型自动识别
- **WHEN** `type` 未指定但 `metadata.filePath` 以图片扩展名结尾（`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`）
- **THEN** 系统 SHALL 自动识别为图片类型并走图片上传流程

### Requirement: 接收文件消息并下载

FeishuChannel SHALL 在收到文件/图片类型消息时自动下载到 workspace 目录。

#### Scenario: 接收普通文件
- **WHEN** 收到 `message_type` 为 `'file'`、`'audio'` 或 `'media'` 的消息
- **THEN** 系统 SHALL 从 content 中解析 `file_key` 和 `file_name`
- **AND** 使用 `client.im.file.get()` 下载文件
- **AND** 保存到 `{workspaceDir}/files/feishu/received/{date}_{fileKey}.{ext}`
- **AND** `message.content` SHALL 包含本地文件路径

#### Scenario: 接收图片消息
- **WHEN** 收到 `message_type` 为 `'image'` 的消息
- **THEN** 系统 SHALL 从 content 中解析 `image_key`
- **AND** 使用 `client.im.image.get()` 下载图片
- **AND** 保存到 `{workspaceDir}/files/feishu/received/{date}_{imageKey}.png`
- **AND** `message.content` SHALL 包含本地文件路径

#### Scenario: 下载失败
- **WHEN** 文件下载 API 调用失败
- **THEN** 系统 SHALL 在日志中记录错误
- **AND** `message.content` SHALL 保留原始文件名作为降级信息
- **AND** 消息仍正常发布到消息总线

#### Scenario: 接收目录不存在
- **WHEN** `{workspaceDir}/files/feishu/received/` 目录不存在
- **THEN** 系统 SHALL 自动创建该目录
