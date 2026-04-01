## MODIFIED Requirements

### Requirement: send_file 内置工具
系统 SHALL 提供 `send_file` 内置工具，允许 Agent 将本地文件发送给当前会话用户。工具 SHALL 通过 harness 层包装，execute 函数返回 `ToolResult`，由 harness 序列化为 string。网络类错误（飞书 API 400/429/5xx）SHALL 返回 `NETWORK` 错误码，触发 harness 自动重试（最多 2 次，指数退避）。

#### Scenario: 发送文件
- **WHEN** Agent 调用 `send_file` 并提供有效的本地文件路径
- **THEN** 系统 SHALL 通过当前会话对应的 channel 发送文件消息
- **AND** 返回成功信息（包含文件名）

#### Scenario: 发送图片
- **WHEN** Agent 调用 `send_file` 且文件路径指向图片
- **THEN** 系统 SHALL 自动识别为图片类型并发送

#### Scenario: 文件不存在
- **WHEN** Agent 调用 `send_file` 但文件路径不存在
- **THEN** 系统 SHALL 返回 `NOT_FOUND` 错误码和 hint

#### Scenario: 无回调注册
- **WHEN** Agent 调用 `send_file` 但未注入发送回调
- **THEN** 系统 SHALL 返回 `PERMISSION` 错误码和 hint

#### Scenario: Channel 不支持文件发送
- **WHEN** 当前会话的 channel 不支持 `sendFile` 能力
- **THEN** 系统 SHALL 返回 `PERMISSION` 错误码和 hint

#### Scenario: 飞书 API 失败自动重试
- **WHEN** 飞书 API 返回 400/429/5xx 错误
- **THEN** 工具 SHALL 返回 `NETWORK` 错误码
- **AND** harness SHALL 自动重试最多 2 次（指数退避 500ms、1000ms）

#### Scenario: 工具仅分配给 general Agent
- **WHEN** 创建 `explore` 或 `plan` Agent 的工具集
- **THEN** 工具集中 SHALL 不包含 `send_file`
