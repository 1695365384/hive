## Context

Agent 在首次对话时需要了解运行环境才能正确选择工具和命令。当前 Agent 完全依赖 Bash 工具运行 `uname`、`which`、`ls` 等命令来"摸底"环境，每次消耗 1-2 个 turns。

Server 在 `bootstrap()` 阶段已经知道自己的运行环境，但这些信息没有传递给 Agent 的 prompt 系统。

## Goals / Non-Goals

**Goals:**
- Server 启动时一次性收集环境信息，零额外 turns 开销
- Agent 的 system prompt 包含结构化的 Environment section
- 探测逻辑纯同步（或快速异步），不阻塞启动超过 500ms
- 桌面端（SEA binary）和 CLI 模式均正常工作

**Non-Goals:**
- 不做运行时动态刷新（环境变化后需重启 server）
- 不做跨平台命令翻译（Agent 根据环境信息自行判断）
- 不收集敏感信息（API keys、HOME 路径细节、用户名等）

## Decisions

### 1. 探测模块放在 packages/core 而非 apps/server

**选择**: `packages/core/src/environment/probe.ts`

**理由**: 环境信息最终服务于 Agent prompt，属于 core 的职责。Server 只负责调用并传递结果。这样 CLI 模式（直接用 core）也能受益。

**替代方案**: 放在 server，通过 AgentOptions 传入。但 CLI 模式绕过 server 时就丢失了环境信息。

### 2. 探测结果结构：EnvironmentContext interface

```typescript
interface EnvironmentContext {
  os: {
    platform: string      // 'darwin' | 'linux' | 'win32'
    arch: string          // 'arm64' | 'x64'
    version: string       // e.g. '20.5.0'
  }
  shell: string           // 'zsh' | 'bash' | 'fish' | 'sh' | 'unknown'
  node: {
    version: string       // e.g. 'v20.11.0'
  }
  tools: string[]         // 可用工具列表: ['pnpm', 'npm', 'git', 'docker', ...]
  packageManager: string  // 'pnpm' | 'npm' | 'yarn' | 'unknown'
  projectType: string     // 'typescript' | 'javascript' | 'golang' | 'python' | 'unknown'
  cwd: string             // 当前工作目录
}
```

**理由**: 扁平结构，易于序列化为 prompt 文本。不嵌套复杂对象。

### 3. Prompt 注入方式：扩展 PromptBuildContext

**选择**: 在 `PromptBuildContext` 新增 `environmentContext?: EnvironmentContext` 字段，`DynamicPromptBuilder.buildSections()` 中渲染为 `## Environment` section。

**理由**: 复用现有的 section 机制和 token budget 控制。Environment section 优先级设为 0（与 base/language/task 同级，永远保留）。

**替代方案**: 在 prompt template 的 `{{variable}}` 中注入。但这要求改所有 template 文件，侵入性更大。

### 4. 探测策略：同步检测 + which 查询

**选择**: OS/shell/node 版本用 `os` 模块同步获取；工具链用 `which` 命令检测（并发，超时 2s）。

**理由**: `os` 模块零开销。`which` 是最可靠的跨平台工具检测方式。并发执行 + 超时保证不阻塞启动。

### 5. Prompt 渲染格式

```
## Environment

- **OS**: macOS (darwin/arm64)
- **Shell**: zsh
- **Node.js**: v20.11.0
- **Package Manager**: pnpm
- **Project Type**: typescript
- **Available Tools**: pnpm, npm, git, docker, python3
- **Working Directory**: /Users/xxx/project
```

**理由**: 简洁的列表格式，~150 tokens，信息密度高。LLM 容易理解。

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| `which` 在 Windows 上不存在 | 检测 `win32` 平台时使用 `where` 替代，或跳过工具链检测 |
| SEA binary 环境下 `child_process` 不可用 | 探测逻辑 fallback 到 `os` 模块，只收集 OS/node 基本信息 |
| 探测结果占用 token budget | Environment section ~150 tokens，优先级 0 保留，影响可忽略 |
| 桌面端 sidecar 环境与用户 shell 环境不同 | 明确标注 "Server environment"，Agent 可通过 Bash 工具进一步确认 |
