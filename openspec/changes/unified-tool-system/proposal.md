## Why

Hive 当前的工具系统存在两个核心问题：(1) 没有提供内置工具——Agent 依赖外部注入的工具才能操作文件、执行命令、搜索代码，而用户每次都要自己实现这些基础设施；(2) 现有工具（memory-tools）使用自定义 `AITool` 接口，没有利用 AI SDK 6.x 的 `tool()` + Zod schema 标准，导致工具对非 Anthropic 模型的兼容性和调用成功率不佳。需要一个统一的、全 provider 通用的内置工具集，作为 Hive Agent 的标准能力层。

## What Changes

- 新建 `packages/core/src/tools/built-in/` 目录，包含 7 个通用工具模块
- 每个工具使用 AI SDK 的 `tool()` + Zod schema 定义，确保所有 provider 兼容
- 新建 `ToolRegistry` 统一管理工具注册、查询、按 Agent 类型分配 activeTools
- `LLMRuntime` 改造：支持接收 AI SDK 标准 Tool 格式，废弃自定义 `AITool` 接口
- Web Search 采用 DuckDuckGo Lite（免费、无 API key）作为通用方案
- Web Fetch 使用 cheerio + turndown（fetch HTML → Markdown），本地解析无外部依赖
- 现有 memory-tools 保留不变，通过 ToolRegistry 统一注册

## Capabilities

### New Capabilities
- `builtin-tools`: 内置工具集定义（bash、file、search、web-search、web-fetch、ask-user），每个工具的 Zod schema、execute 实现、安全边界
- `tool-registry`: 工具注册表，统一注册/查询/按 Agent 类型分配 activeTools，替代当前 LLMRuntime 中硬编码的工具传递方式

### Modified Capabilities
- `unified-execution-engine`: LLMRuntime 需改造为接收 AI SDK 标准 Tool 格式（`tool()` 返回的 `Tool` 类型），废弃自定义 `AITool` 接口

## Impact

- `packages/core/src/tools/` — 新增 `built-in/` 子目录 + `tool-registry.ts`
- `packages/core/src/agents/runtime/LLMRuntime.ts` — `convertTools()` 方法改造，支持 AI SDK Tool 格式
- `packages/core/src/agents/runtime/types.ts` — `AITool` 接口废弃，新增兼容层或删除
- `packages/core/src/agents/core/runner.ts` — AgentRunner 传递工具方式更新
- `packages/core/package.json` — 新增依赖：`cheerio`、`turndown`
- 现有测试需要适配新的工具格式
