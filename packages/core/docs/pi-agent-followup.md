# Follow-up: pi-agent as AgentLoop backend

Status: `landed: pi-only kernel + pi-catalog provider chain (awaiting real smoke)`

## Scope

外层协议不动：`ServerImpl.dispatchToAgent`、`DispatchOptions` / `DispatchResult`、WS `StreamingEventUnion`、`session-fs`、`send-file`、GoalStore / Continue。

执行核：**仅** `@oh-my-pi/pi-coding-agent` `createAgentSession()`。已删除 dual-kernel / legacy 回滚面。

运行时宿主：**Bun 跑 server 主进程**（`apps/server` `start` / `cli`）。SEA 一律不可用（Node SEA 无法携带 pi）。

## 8 大核心组件（Hive 路线图）

> **说明：** “8 大核心组件”并非 oh-my-pi 官方固定名词；Hive 采用以下 8 个包/能力作为接入路线图。

| # | 组件 | 包 | 对本仓库的作用 | 阶段 |
|---|---|---|---|---|
| 1 | LLM/Auth | `@oh-my-pi/pi-ai` | 主会话传输（经 createAgentSession） | **已接入主路径** |
| 2 | Model Catalog | `@oh-my-pi/pi-catalog` | 模型发现/身份 | **已接入主路径** |
| 3 | Agent Runtime | `@oh-my-pi/pi-agent-core` | ReAct/事件/工具循环 | **已接入主路径** |
| 4 | Session SDK | `@oh-my-pi/pi-coding-agent` | `createAgentSession` 嵌入壳 | **已接入** |
| 5 | Edit/Search natives | `hashline` + `@oh-my-pi/pi-natives` | 更高保真编辑/搜索 | 下一阶段（内核稳后默认享受） |
| 6 | Memory | `@oh-my-pi/pi-mnemopi` | 替代/增强 FileMemory | 后续 |
| 7 | Compaction | `snapcompact` + session compaction settings | 长上下文 | 后续 |
| 8 | Collab/TUI | `@oh-my-pi/pi-wire` / `pi-tui` / `omp-stats` | CLI/协作；Hive Desktop 不接 | 明确 skip |

### 边界

- 主会话路径只走 **1–4**。
- **5–7** 触发条件：实机 smoke（简单问答 / 写文件+send-file / chat.cancel）通过后再开。
- **8** skip：Hive Desktop 自有 WS 协议。
- 已删除：`LLMRuntime`、`AgentRunner`、`createAgentTool`、`AdversarialHarness`。`ToolRegistry` 挂在 `AgentContext.toolRegistry`。

## Keep unchanged

- Desktop `agent.*` / `StreamingEventUnion` 字段名
- `session-fs` 语义
- GoalStore API
- pi 嵌入路径：`enableMCP` / `enableLsp` / extension discovery 关闭；Hive MCP 经 `customTools` 桥接

## Key files

- `packages/core/src/agents/core/AgentLoop.ts` — 唯一执行入口（pi-only）
- `packages/core/src/agents/core/PiAgentSessionAdapter.ts` — session 嵌入 + 事件映射
- `packages/core/src/agents/core/hive-tool-bridge.ts` — Hive/MCP → CustomTool
- `packages/core/src/providers/pi-auth-bridge.ts` — ProviderManager → AuthStorage/Model

## Verification

- `pnpm exec tsc -p tsconfig.build.json --noEmit` — pass
- `tests/unit/agents/pi-agent-session-adapter.test.ts` — pass
- `pnpm --filter @bundy-lmw/hive-core test` — 1265 passed / 17 skipped（旧核单测已删）
- Real smoke：`bun` 启动 server + Desktop chat.send / write+send-file / chat.cancel — passed (opencode-zen + deepseek-v4-flash-free)
- SEA：脚本纯失败 stub；desktop `build` 不再调用 bundle.mjs

## Scout notes

Official oh-my-pi has no canonical "8 components" list; roadmap maps published packages to cutover stages. Keep Hive transport unchanged.


## Provider catalog (no dual source)

- UI `provider.list` / `provider.getModels` / `provider.testKey` → `pi-catalog-bridge` → `@oh-my-pi/pi-catalog` (+ `pi-ai` for testKey).
- Runtime model resolve → `pi-auth-bridge` → same catalog ids (aliases: `glm→zai`, `kimi→moonshot`, `qwen→qwen-portal`).
- Legacy models.dev / AI SDK adapter stack removed; pi catalog is the only provider source.
- When bumping `@oh-my-pi/pi-catalog`, regenerate `src/providers/pi-catalog-descriptors.json` from `CATALOG_PROVIDERS`.
