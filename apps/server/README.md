# @hive/server

Hive 多 Agent 协作框架的服务器应用。

## 安装

```bash
pnpm install
pnpm build
```

## 配置

### 方式一：使用 hive.config.json（推荐）

创建 `hive.config.json` 文件：

```json
{
  "server": {
    "port": 3000,
    "logLevel": "info"
  },
  "provider": {
    "id": "glm",
    "apiKey": "${GLM_API_KEY}",
    "model": "glm-4-plus"
  },
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

环境变量使用 `${VAR_NAME}` 语法，会自动从 `.env` 文件或系统环境变量中读取。

### 方式二：使用 .env 文件

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# LLM 提供商配置
PROVIDER_ID=glm
API_KEY=your-api-key-here

# 飞书插件（可选）
FEISHU_APP_ID=cli_xxxxxx
FEISHU_APP_SECRET=xxxxxx
```

## 使用

### CLI 命令

```bash
# 查看帮助
hive --help

# 查看版本
hive --version

# 启动交互式聊天
hive chat

# 启动 HTTP/WebSocket 服务器
hive server

# 指定端口启动
hive server --port 8080
```

### HTTP API

服务器启动后，提供以下端点：

| 端点 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/chat` | POST | 发送聊天消息 |
| `/api/sessions` | GET | 获取会话列表 |
| `/api/sessions/:id` | GET | 获取会话详情 |
| `/webhook/:plugin/:appId` | POST | 插件 Webhook |

#### 聊天示例

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "你好"}'
```

### WebSocket

连接到 `ws://localhost:3000/ws` 进行实时通信：

```javascript
const ws = new WebSocket('ws://localhost:3000/ws')

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'chat', message: '你好' }))
}

ws.onmessage = (event) => {
  console.log(JSON.parse(event.data))
}
```

## 插件系统

Hive 支持通过插件扩展通道能力。

### 配置插件

在 `hive.config.json` 中配置插件：

```json
{
  "plugins": {
    "@hive/plugin-feishu": {
      "apps": [
        {
          "appId": "cli_xxxxxx",
          "appSecret": "xxxxxx"
        }
      ]
    }
  }
}
```

### Webhook 配置

对于飞书等需要接收事件的平台，配置 Webhook URL：

```
https://your-server.com/webhook/feishu/{appId}
```

### 开发插件

创建新插件需要实现 `IPlugin` 接口：

```typescript
import type { IPlugin, IChannel, PluginContext } from '@hive/core'

export class MyPlugin implements IPlugin {
  readonly metadata = {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0'
  }

  async initialize(context: PluginContext): Promise<void> {
    // 初始化逻辑
  }

  async activate(): Promise<void> {
    // 激活插件
  }

  async deactivate(): Promise<void> {
    // 停用插件
  }

  getChannels(): IChannel[] {
    // 返回通道列表
    return []
  }
}
```

## 架构

```
┌─────────────────────────────────────────────────────┐
│                    CLI Entry                        │
│                 (src/cli/index.ts)                  │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│                    Bootstrap                        │
│                 (src/bootstrap.ts)                  │
│  ┌─────────┐  ┌────────┐                            │
│  │Agent    │  │Message │                            │
│  │         │  │Bus     │                            │
│  └────┬────┘  └────┬───┘                            │
└───────┼────────────┼────────────────────────────────┘
        │            │
┌───────▼────────────▼─────────────────────────────────┐
│                   Gateways                          │
│  ┌─────────────────────┐  ┌──────────────────────┐  │
│  │HTTP (Hono)          │  │WebSocket             │  │
│  │- /api/chat          │  │- Real-time chat      │  │
│  │- /api/sessions      │  │- Event streaming     │  │
│  └─────────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## 开发

```bash
# 监视模式构建
pnpm dev

# 运行测试
pnpm test

# 测试监视模式
pnpm test:watch
```

## 许可证

MIT
