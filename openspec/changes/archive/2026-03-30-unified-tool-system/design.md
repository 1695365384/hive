## Context

Hive 是多 Agent 协作框架，支持 Anthropic / OpenAI / Google / 国产 LLM 等多 provider。当前工具系统：

- `memory-tools.ts` 使用自定义 `AITool` 接口，`LLMRuntime.convertTools()` 转换为 AI SDK Tool 格式
- 没有内置的文件操作、命令执行、代码搜索等基础工具
- AI SDK 6.x 提供了 `tool()` + Zod schema 标准工具定义方式，所有 provider 均支持
- AI SDK 的 Anthropic provider 提供 provider-defined tools（bash、textEditor 等），但这些只在 Anthropic API 层面生效，对其他 provider 无效

约束：
- 所有工具必须对任何 provider 可用（这是 Hive 的核心价值）
- 不能依赖外部 API（如 SerpAPI、Google Search API）
- 现有 memory-tools（SQLite 实现）保留不动

## Goals / Non-Goals

**Goals:**
- 提供 7 个通用内置工具，覆盖 Agent 最常用的操作场景
- 使用 AI SDK `tool()` + Zod schema 标准定义，确保全 provider 兼容
- 通过 ToolRegistry 统一管理，支持按 Agent 类型（explore/plan/general）分配 activeTools
- LLMRuntime 原生支持 AI SDK Tool 格式，无需中间转换层
- 工具 execute 函数内集成安全检查（命令过滤、路径限制、输出截断）

**Non-Goals:**
- 不实现 provider-specific 工具优化（如 Anthropic web_search、OpenAI code_interpreter）
- 不替换现有 memory-tools，只通过 ToolRegistry 统一注册
- 不实现 MCP 工具协议（这是另一个 change）
- 不实现工具的 needsApproval 审批流程（属于权限系统 change）

## Decisions

### D1: 使用 AI SDK `tool()` 而非 provider-defined tools

**选择**: 所有内置工具用 `tool({ description, parameters: z.object(), execute })` 定义

**替代方案**:
- A) 使用 `anthropic.tools.bash()` 等 provider-defined tools → 只有 Anthropic 模型能用，违背项目定位
- B) 双轨制：Anthropic 用 provider-defined，其他用自定义 → 维护两套 schema，复杂度高

**理由**: `tool()` + Zod 是 AI SDK 的通用标准，所有 provider 都支持。现代 LLM（包括 Claude、GPT、Gemini、GLM）都能理解结构良好的 Zod schema。Provider-defined tools 的优势（模型训练优化）在实际使用中差异不大。

### D2: Web Search 使用 DuckDuckGo Lite

**选择**: 抓取 `https://lite.duckduckgo.com/lite/?q=...` HTML 页面，解析搜索结果

**替代方案**:
- A) SerpAPI / Google Custom Search → 需要外部 API key
- B) SearXNG 自建实例 → 需要部署额外服务
- C) 不提供搜索工具 → Agent 信息获取能力严重不足

**理由**: DuckDuckGo Lite 是免费服务，无需 API key，HTML 结构稳定，被 LangChain 等主流框架采用。通过 cheerio 解析 HTML，不引入额外 API 依赖。

### D3: Web Fetch 使用 cheerio + turndown

**选择**: `fetch(url)` → cheerio 解析 HTML → turndown 转 Markdown

**替代方案**:
- A) Readability.js（Mozilla 阅读模式提取）→ 依赖重，主要针对文章类页面
- B) 原始 HTML 返回 → 模型处理 HTML 效果差，浪费 token

**理由**: cheerio 轻量（~30KB），turndown 是最成熟的 HTML→Markdown 库。去除 script/style/nav 等噪音元素后转 Markdown，模型理解效果最好。设置 maxChars 默认 30000 防止撑爆上下文。

### D4: File 工具三合一（Read/Write/Edit）

**选择**: 一个 `file` 工具，通过 `command` 参数区分操作类型

**替代方案**:
- A) 拆成三个独立工具（readFile、writeFile、editFile）→ 模型需要选对工具，增加错误概率
- B) 用 Anthropic textEditor schema → 不通用

**理由**: Anthropic 的 textEditor 设计已经证明了 command 模式的有效性。一个工具三种操作，模型不需要在"选哪个工具"上浪费思考。command 包含：`view`（读取）、`create`（新建）、`str_replace`（替换）、`insert`（插入）、`undo_edit`（撤销）。

### D5: ToolRegistry 独立于 LLMRuntime

**选择**: 新建 `ToolRegistry` 类，负责工具注册、查询、按 agent 类型过滤

**替代方案**:
- A) 工具定义直接写在 LLMRuntime 里 → 耦合度高，子 Agent 无法自定义工具集
- B) 工具定义写在 AgentRunner 里 → Runner 已经很重，职责不清

**理由**: ToolRegistry 是独立关注点。它管理"有哪些工具可用"，LLMRuntime 只负责"把这些工具传给 AI SDK"。AgentRunner 通过 ToolRegistry 获取 agent 类型对应的工具集，传给 LLMRuntime。

### D6: Agent 类型决定可用工具集

**选择**: ToolRegistry 按预定义的 agent 类型（explore/plan/general）维护工具白名单

**工具分配矩阵**:

| 工具 | explore | plan | general |
|------|---------|------|---------|
| bash | - | - | ✅ |
| file | ✅ (view only) | ✅ (view only) | ✅ (all commands) |
| glob | ✅ | ✅ | ✅ |
| grep | ✅ | ✅ | ✅ |
| web-search | ✅ | ✅ | ✅ |
| web-fetch | ✅ | ✅ | ✅ |
| ask-user | - | - | ✅ |

**理由**: explore/plan 是只读探索型 Agent，不应该有写入或执行能力。这是 harness engineering 的核心——通过工具白名单实现权限边界。

## Risks / Trade-offs

- **[DuckDuckGo Lite 不稳定性]** → HTML 结构可能变化导致解析失败。Mitigation: 解析失败时返回空结果 + 错误提示，不阻塞 Agent 流程；后续可切换到其他免费搜索源
- **[cheerio + turndown 依赖体积]** → 两个库合计约 200KB。Mitigation: 这是工具层依赖，不影响核心包体积；若需要可 lazy import
- **[file 工具 command 模式]** → 非 Claude 模型可能不如三个独立工具用得好。Mitigation: 在 tool description 中用清晰的示例和说明引导模型
- **[工具输出大小]** → grep 或 file read 可能返回巨大内容。Mitigation: 所有工具统一设置 maxOutputLength（默认 30000 字符），超出时截断并提示
