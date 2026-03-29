## MODIFIED Requirements

### Requirement: ChannelSendOptions 接口
`ChannelSendOptions` SHALL 包含发送消息所需的所有信息，包括可选的文件路径。

```typescript
interface ChannelSendOptions {
  /** 消息内容（文件发送时可忽略） */
  content: string
  /** 消息类型 */
  type?: ChannelMessageType
  /** 目标 ID（用户 ID 或群聊 ID） */
  to: string
  /** 本地文件路径（发送文件/图片时使用） */
  filePath?: string
  /** 回复的消息 ID */
  replyTo?: string
  /** 元数据 */
  metadata?: Record<string, unknown>
}
```

#### Scenario: 发送文件消息
- **WHEN** `filePath` 字段有值且 `type` 为 `'file'` 或 `'image'`
- **THEN** channel SHALL 读取 `filePath` 作为要上传的本地文件路径

#### Scenario: 向后兼容
- **WHEN** 现有代码不传 `filePath`
- **THEN** 行为不变，`filePath` 为 `undefined`
