# @hive/server

Hive 多 Agent 协作框架的服务器应用。

## 安装

```bash
pnpm install
pnpm build
```

## 配置

复制示例配置文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置你的 API Key：

```env
# LLM 提供商配置
PROVIDER_ID=glm  # 或 anthropic, openai, deepseek
API_KEY=your-api-key-here

# 插件（可选）
PLUGINS=@larksuite/openclaw-lark
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

# 加载插件启动
hive server --plugins @larksuite/openclaw-lark
```

### HTTP API

服务器启动后，提供以下端点：

| 端点 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/chat` | POST | 发送聊天消息 |
| `/api/sessions` | GET | 获取会话列表 |
| `/api/sessions/:id` | GET | 获取会话详情 |
| `/api/plugins` | GET | 获取已加载插件 |

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

## 插件开发

Hive 支持加载 OpenClaw 兼容的插件：

```bash
# 安装插件
pnpm add @larksuite/openclaw-lark

# 配置启用
PLUGINS=@larksuite/openclaw-lark
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
│  ┌─────────┐  ┌────────┐  ┌──────────────────────┐ │
│  │Agent    │  │Message │  │OpenClaw Plugin       │ │
│  │         │  │Bus     │  │Loader                │ │
│  └────┬────┘  └────┬───┘  └──────────┬───────────┘ │
└───────┼────────────┼─────────────────┼─────────────┘
        │            │                 │
┌───────▼────────────▼─────────────────▼─────────────┐
│                   Gateways                          │
│  ┌─────────────────────┐  ┌──────────────────────┐ │
│  │HTTP (Hono)          │  │WebSocket             │ │
│  │- /api/chat          │  │- Real-time chat      │ │
│  │- /api/sessions      │  │- Event streaming     │ │
│  │- /api/plugins       │  │- Session management  │ │
│  └─────────────────────┘  └──────────────────────┘ │
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
