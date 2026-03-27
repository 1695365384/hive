## Context

code-quality-fixes 已消除 `packages/core/src` 中大部分 `as any`（从 20+ 降至 0）并建立了 ILogger 注入模式。但第二轮扫描发现：

- 4 处 `as any` 残留在 `config/validator.ts`、`prompts/templates/index.ts`、`apps/server/src/gateway/http.ts`
- 6 处 console 调用未使用 ILogger（MonitoringHooks × 4、PromptTemplate × 1、skills/loader × 1）
- 2 个类型文件过大（`hooks/types.ts` 645 行、`agents/types.ts` 501 行）
- Channel 插件缺少统一 WebhookHandler 接口
- 1 个 `@deprecated` 导出和 1 个硬编码 localhost

## Goals / Non-Goals

**Goals:**
- 将 `packages/core/src` 中的 `as any` 清零至 0
- 将 `apps/server/src` 中的 `as any` 清零至 0
- 补齐所有非 CLI 模块的 Logger 注入
- 超大类型文件拆分至 300 行以内
- 定义 WebhookHandler 接口消除网关层类型逃逸

**Non-Goals:**
- 大文件拆分不涉及逻辑文件（Agent.ts、runner.ts 等实现文件暂不拆分）
- 不新增测试覆盖（gateway 层测试补全属于独立 change）
- 不重构 MonitoringHooks 的业务逻辑

## Decisions

### D1: AJV 类型使用 `Ajv.ValidationError` 替代 `any[]`

`config/validator.ts` 中 `formatErrors(errors: any[])` 使用 `any[]` 接收 AJV 错误。AJV 导出 `ErrorObject<string, Record<string, any>, unknown>` 类型，直接使用即可。

### D2: Channel WebhookHandler 接口放在 `packages/core/src/plugins/types.ts`

Channel 是插件系统的一部分，WebhookHandler 接口定义在此处最合适。飞书插件实现此接口，`gateway/http.ts` 通过接口类型检查而非 `as any`。

```typescript
interface WebhookHandler {
  handleWebhook(body: unknown, signature?: string, timestamp?: string, nonce?: string): Promise<unknown>;
}
```

### D3: 类型文件拆分策略 — 按领域拆分，保持 barrel export

`hooks/types.ts` 拆分为：
- `hooks/types.ts` — 保留核心类型（HookContext、HookResult、HookPriority）
- `hooks/types/audit.ts` — 审计相关类型
- `hooks/types/monitoring.ts` — 监控相关类型
- `hooks/types/security.ts` — 安全相关类型
- `hooks/types/rate-limiter.ts` — 限流相关类型

`agents/types.ts` 拆分为：
- `agents/types.ts` — 保留核心类型（AgentConfig、AgentOptions）
- `agents/types/capabilities.ts` — 能力相关类型
- `agents/types/runner.ts` — 执行器相关类型

原 `hooks/types.ts` 和 `agents/types.ts` 改为 barrel re-export 文件，**不破坏现有 import 路径**。

### D4: MonitoringHooks Logger 注入

MonitoringHooks 构造函数接受 `ILogger`，默认 `noopLogger`。4 处 `console.log` 替换为 `this.logger.info()`。

### D5: PromptTemplate Logger 注入

PromptTemplate 的 `console.warn` 替换为可选 `logger` 参数，默认 `noopLogger`。

### D6: skills/loader Logger 注入

SkillLoader 构造函数接受可选 `ILogger`，`console.warn` 替换为 `this.logger.warn()`。

### D7: 移除 deprecated config 导出

删除 `apps/server/src/config.ts` 中的 `export const config` 和 `main.ts` 中的 `export { getConfig as config }`。所有消费者直接使用 `getConfig()`。

## Risks / Trade-offs

- **[类型拆分 barrel re-export]** → 原有 import 路径不变，但 IDE 跳转会多一层间接。可通过 `isolatedModules` 检查确保无问题。
- **[WebhookHandler 接口]** → 飞书插件需要 implements 此接口，如果参数签名不完全匹配需要调整。
- **[deprecated 导出移除]** → 如果有外部消费者使用 `config` 导出，会编译报错。检查 monorepo 内所有引用确认无外部依赖。
