## ADDED Requirements

### Requirement: send_file 内置工具

系统 SHALL 提供 `send_file` 内置工具，允许 Agent 将本地文件发送给当前会话用户。

#### Scenario: 发送文件
- **WHEN** Agent 调用 `send_file` 并提供有效的本地文件路径
- **THEN** 系统 SHALL 通过当前会话对应的 channel 发送文件消息
- **AND** 返回成功信息（包含文件名）

#### Scenario: 发送图片
- **WHEN** Agent 调用 `send_file` 且文件路径指向图片（`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`）
- **THEN** 系统 SHALL 自动识别为图片类型并发送

#### Scenario: 文件不存在
- **WHEN** Agent 调用 `send_file` 但文件路径不存在
- **THEN** 系统 SHALL 返回错误信息，不调用 channel 发送

#### Scenario: 无回调注册
- **WHEN** Agent 调用 `send_file` 但未注入发送回调（如非通道场景）
- **THEN** 系统 SHALL 返回提示信息，说明当前环境不支持文件发送

#### Scenario: Channel 不支持文件发送
- **WHEN** 当前会话的 channel 不支持 `sendFile` 能力
- **THEN** 系统 SHALL 返回提示信息

#### Scenario: 工具仅分配给 general Agent
- **WHEN** 创建 `explore` 或 `plan` Agent 的工具集
- **THEN** 工具集中 SHALL 不包含 `send_file`
