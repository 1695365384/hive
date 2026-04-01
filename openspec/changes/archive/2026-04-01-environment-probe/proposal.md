## Why

Server 启动时不知道当前运行环境（OS、shell、包管理器、可用工具链、项目类型），导致 Agent 每次对话都需要通过 Bash 工具去"摸底"——跑 `uname -a`、`which node`、`ls` 等命令，浪费 1-2 个 turns 且 token 成本累积。Agent 在缺乏环境信息时可能选错工具（如 Linux 上用 `brew`）或路径，影响执行效率和准确性。

## What Changes

- 新增 `EnvironmentProbe` 模块，Server 启动时一次性收集系统环境信息
- 收集内容包括：OS 平台/arch、shell 类型、可用工具链（node/pnpm/git/docker 等）、项目类型（TS/Go/Python）、包管理器、当前工作目录
- 将探测结果注入到 Agent 的 system prompt 中作为 `## Environment` section
- 桌面端（Tauri sidecar）和 CLI 模式均正常工作

## Non-goals

- 不做动态环境感知（server 运行期间环境变化的实时检测）
- 不做跨平台命令适配（Agent 本身应通过环境信息自行判断）
- 不收集敏感信息（API keys、环境变量值、用户数据等）

## Capabilities

### New Capabilities
- `environment-probe`: 启动时环境探测，收集 OS/shell/工具链/项目类型信息并构建结构化上下文

### Modified Capabilities
- `agent-context-factory`: PromptBuildContext 新增 environmentContext 字段，DynamicPromptBuilder 将其渲染到 system prompt 中

## Impact

- **packages/core**: 新增 `src/environment/` 模块（探测逻辑 + 类型定义），修改 DynamicPromptBuilder 和 PromptBuildContext
- **apps/server**: bootstrap/main 中调用 EnvironmentProbe 并将结果传入 Agent
- **apps/desktop**: 无直接变更（依赖 server 的探测结果）
- **API**: 无新增 API
- **依赖**: 无新增外部依赖（使用 Node.js 内置 `os`、`child_process` 模块）
