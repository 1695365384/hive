## Context

Hive Server 目前使用 `.env` 环境变量进行配置。OpenClaw 插件（如 `@larksuite/openclaw-lark`）期望通过 `api.config` 接收嵌套的配置结构，例如：

```javascript
api.config.channels.feishu.appId
api.config.channels.feishu.appSecret
```

当前 bootstrap.ts 传给插件的 `api.config` 是空对象 `{}`，导致插件无法获取配置。

## Goals / Non-Goals

**Goals:**
- 统一配置入口：`hive.config.json`
- 支持 JSON Schema 验证
- 兼容 OpenClaw 插件配置格式
- 敏感信息支持环境变量覆盖

**Non-Goals:**
- 不实现配置热更新
- 不实现配置加密存储
- 不实现多环境配置文件切换

## Decisions

### 1. 配置文件格式：JSON vs YAML vs TOML

**选择 JSON**
- 原生支持，无需额外解析器
- 与 JSON Schema 天然兼容
- OpenClaw 生态使用 JSON

### 2. 配置加载优先级

```
环境变量 > hive.config.json > 默认值
```

这样敏感信息（API Key）可以通过环境变量覆盖，无需写入配置文件。

### 3. 配置结构设计

```json
{
  "server": {
    "port": 3000,
    "host": "127.0.0.1",
    "logLevel": "info"
  },
  "provider": {
    "id": "glm",
    "apiKey": "${GLM_API_KEY}",
    "model": "glm-4"
  },
  "plugins": {
    "@larksuite/openclaw-lark": {
      "channels": {
        "feishu": {
          "appId": "cli_xxx",
          "appSecret": "xxx"
        }
      }
    }
  }
}
```

**关键点：**
- `plugins[pluginName]` 直接作为 `api.config` 传给插件
- 支持 `${ENV_VAR}` 语法从环境变量读取值

### 4. 敏感信息处理

使用 `${ENV_VAR}` 占位符语法：
```json
{
  "provider": {
    "apiKey": "${GLM_API_KEY}"
  },
  "plugins": {
    "@larksuite/openclaw-lark": {
      "channels": {
        "feishu": {
          "appSecret": "${FEISHU_APP_SECRET}"
        }
      }
    }
  }
}
```

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 配置文件泄露敏感信息 | 使用 `${ENV_VAR}` 占位符，敏感值从环境变量读取 |
| JSON 不支持注释 | 提供 `hive.config.example.json` 带详细注释 |
| 迁移成本 | 保持 `.env` 兼容，渐进式迁移 |
