## Why

当前 Hive Server 使用 `.env` 环境变量进行配置，这种方式有以下问题：
- 配置分散，难以管理复杂配置（如插件的多层嵌套配置）
- 不支持配置验证和 Schema 定义
- 与 OpenClaw 插件生态的配置方式不兼容（插件期望 `api.config.channels.feishu` 结构）

现在需要实现统一的 JSON Schema 配置系统，使供应商配置和插件配置使用同一套机制，并支持 OpenClaw 插件的原生配置格式。

## What Changes

- 新增 `hive.config.json` 配置文件作为主配置源
- 新增 `hive.config.schema.json` JSON Schema 定义文件
- 重构 `config.ts` 支持 JSON 配置加载和验证
- 修改 `bootstrap.ts` 传递 `pluginConfig` 给 OpenClaw 插件
- 保留 `.env` 作为敏感信息（API Key）的可选覆盖方式
- **BREAKING**: `PLUGINS` 环境变量改为 `hive.config.json` 中的 `plugins` 字段

## Capabilities

### New Capabilities

- `json-config`: JSON Schema 配置系统，支持配置加载、验证、默认值

### Modified Capabilities

- 无（这是新增功能，不修改现有 spec）

## Impact

- `apps/server/src/config.ts` - 重构为支持 JSON 配置
- `apps/server/src/bootstrap.ts` - 传递 pluginConfig 给插件
- `apps/server/hive.config.example.json` - 示例配置文件
- `apps/server/hive.config.schema.json` - JSON Schema 定义
- `.env` - 简化为仅包含敏感信息覆盖
