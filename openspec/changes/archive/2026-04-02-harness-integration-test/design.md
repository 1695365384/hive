## Context

Harness 层位于 rawTool（execute → ToolResult）和 AI SDK tool（execute → string）之间，提供 retry + hint injection + serialize + 异常兜底。当前只有单元测试（全部 mock execute），缺少让真实 rawTool 跑过完整管道的集成测试。

现有测试结构：
```
packages/core/tests/
├── unit/
│   ├── tools/
│   │   ├── bash-tool.test.ts      # bash rawTool 单元测试
│   │   ├── file-tool-raw.test.ts  # file rawTool 单元测试（新增）
│   │   └── harness.test.ts        # harness 各模块 mock 测试
│   └── ...
└── e2e/
    └── agent-real.test.ts         # 真实 LLM 端到端
```

## Goals / Non-Goals

**Goals:**
- 真实 rawTool 经过 withHarness 完整管道后，验证输出 string 格式正确
- 覆盖快乐路径（OK）、错误路径（RECOVERABLE + hint）、安全拦截（BLOCKED + hint）、权限控制
- 超时重试行为验证（mock 超时，不依赖真实网络延迟）
- 异常兜底验证（rawTool throw → harness 捕获 → `[Error]` string）
- 测试跑在 `pnpm test` 中，CI 友好，不依赖外部 API

**Non-Goals:**
- 不测试 LLM 对 hint 的理解能力
- 不修改 harness 层实现
- 不引入新测试框架

## Decisions

### 1. 测试文件位置：`tests/unit/tools/harness-integration.test.ts`

放在 unit 目录下而非新建 integration 目录。原因：
- 测试不依赖外部服务（LLM API、网络），执行速度 <1s
- 项目现有约定是 `tests/unit/` vs `tests/e2e/`，无独立 integration 层
- vitest.config.ts 不需要改动

### 2. 临时文件策略：`beforeEach` 创建 + `afterEach` 清理

使用 `os.tmpdir()` + 随机后缀创建临时目录，测试操作都在临时目录内完成。避免污染项目文件系统。

### 3. 超时测试策略：不 mock child_process，而是用极短 timeout

```typescript
// 不需要 mock exec，直接用 timeout: 1000 + sleep 5 的命令
createRawBashTool().execute({ command: 'sleep 5', timeout: 1000 })
```

这比 mock 更真实，且执行时间可控（~1s + retry delay）。

### 4. 不直接测试 withHarness 返回的 AI SDK Tool

withHarness 内部用 `tool()` 包装并 `as any`，测试 AI SDK Tool 的 execute 签名不稳定。改为：
- 直接测试 `rawTool.execute → ToolResult`（验证 rawTool 本身）
- 直接测试 `serializeToolResult(ToolResult)`（验证序列化）
- 组合测试 `rawTool.execute → serializeToolResult → string`（验证端到端管道）

这样更稳定，且覆盖了 harness 的核心价值。

## Risks / Trade-offs

- **[风险] 文件操作测试依赖文件系统** → 使用 tmpdir 隔离，不影响项目文件
- **[风险] 超时测试增加 CI 时间** → 使用极短 timeout（1s），总增加 <2s
- **[权衡] 不测试 withHarness 的 tool() 包装** → tool() 是 AI SDK 的职责，harness 的核心是 retry + serialize
