# @hive/plugin-feishu

飞书消息通道插件，基于 `@larksuiteoapi/node-sdk` 实现。

## 功能

- ✅ 接收飞书消息事件（通过 Webhook）
- ✅ 发送文本消息
- ✅ 发送卡片消息
- ✅ 发送 Markdown 消息
- ✅ 回复消息
- ✅ 多租户支持（多个飞书应用）
- ✅ 签名验证
- ✅ Challenge 响应

## 安装

```bash
pnpm add @hive/plugin-feishu
```

## 配置

在 `hive.config.json` 中添加插件配置：

```json
{
  "plugins": {
    "@hive/plugin-feishu": {
      "apps": [
        {
          "appId": "${FEISHU_APP_ID}",
          "appSecret": "${FEISHU_APP_SECRET}"
        }
      ]
    }
  }
}
```

### 环境变量

```bash
# .env - 必需
FEISHU_APP_ID=cli_xxxxxx
FEISHU_APP_SECRET=xxxxxx

# 可选（用于签名验证）
# FEISHU_ENCRYPT_KEY=xxxxxx
# FEISHU_VERIFY_TOKEN=xxxxxx
```

### 多租户配置

```json
{
  "plugins": {
    "@hive/plugin-feishu": {
      "apps": [
        {
          "appId": "${FEISHU_APP_ID_1}",
          "appSecret": "${FEISHU_APP_SECRET_1}"
        },
        {
          "appId": "${FEISHU_APP_ID_2}",
          "appSecret": "${FEISHU_APP_SECRET_2}"
        }
      ]
    }
  }
}
```

## Webhook 配置

### 1. 飞书开放平台权限配置

在飞书开放平台 → 应用 → 权限管理中开通以下权限：

| 权限 | 说明 |
|------|------|
| `im:message` | 获取与发送单聊、群组消息 |
| `im:message:send_as_bot` | 以应用身份发消息 |
| `im:chat` | 获取群组信息 |
| `im:chat:readonly` | 获取群组列表 |

### 2. 事件订阅

在飞书开放平台 → 应用 → 事件订阅中配置：

```
https://your-server.com/webhook/feishu/{appId}
```

订阅事件：
- `im.message.receive_v1` - 接收消息

### 3. 机器人能力

在飞书开放平台 → 应用 → 机器人配置中：
- 启用机器人
- 配置消息卡片（可选）

## 消息格式

### 接收消息

插件会将飞书消息转换为通用 `ChannelMessage` 格式：

```typescript
interface ChannelMessage {
  id: string           // 消息 ID
  content: string      // 消息内容
  type: 'text' | 'image' | 'file' | 'card' | 'markdown'
  from: {
    id: string         // 发送者 ID
    type: 'user'
  }
  to: {
    id: string         // 群聊 ID
    type: 'group'
  }
  timestamp: number    // 时间戳（毫秒）
  raw: unknown         // 原始飞书事件
}
```

### 发送消息

```typescript
// 获取通道
const channel = plugin.getChannelByAppId('cli_xxxxxx')

// 发送文本消息
await channel.send({
  to: 'oc_xxxxxx',      // 群聊 ID
  content: 'Hello!',
  type: 'text'
})

// 发送 Markdown 消息
await channel.send({
  to: 'oc_xxxxxx',
  content: '# Title\n\n**Bold text**',
  type: 'markdown'
})

// 发送卡片消息
await channel.send({
  to: 'oc_xxxxxx',
  content: JSON.stringify({
    type: 'template',
    data: {
      template_id: 'xxxxx'
    }
  }),
  type: 'card'
})
```

## 事件

插件通过 MessageBus 发布以下事件：

| 事件 | 描述 |
|------|------|
| `channel:feishu:{appId}:message:received` | 收到飞书消息 |

## 开发

```bash
# 构建
pnpm build

# 监视模式
pnpm dev

# 测试
pnpm test
```

## 许可证

MIT
