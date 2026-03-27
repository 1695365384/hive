## Why

code-quality-fixes 解决了类型安全、资源生命周期、Logger 注入等核心问题，但第二轮扫描发现仍有类型安全残留（4 处 `as any`）、Logger 注入遗漏（MonitoringHooks 等 6 处）、大文件膨胀（13 个文件超 400 行）、以及网关层缺少 Channel 接口抽象。

## What Changes

- 消除剩余 4 处 `as any` 类型断言（validator.ts × 3、gateway/http.ts × 2、templates/index.ts × 1）
- 为 Channel 插件定义 `WebhookHandler` 接口，消除 `gateway/http.ts` 的 `as any`
- 为 MonitoringHooks、PromptTemplate、skills/loader 注入 ILogger
- 拆分超大类型文件（`hooks/types.ts` 645 行 → 按领域拆分；`agents/types.ts` 501 行 → 按关注点拆分）
- 清理 `@deprecated` 导出（`apps/server/src/config.ts` 的 `config` 导出）
- 移除硬编码 `localhost:4000` fallback

## Capabilities

### New Capabilities
- `webhook-handler-interface`: Channel 插件统一 WebhookHandler 接口，消除网关层的 `as any`
- `type-file-split`: 拆分超大类型文件，按领域/关注点重组
- `logger-injection-phase2`: 补齐 Logger 注入遗漏（MonitoringHooks、PromptTemplate、skills/loader）

### Modified Capabilities

## Impact

- `packages/core/src/config/validator.ts` — AJV 类型修复
- `packages/core/src/agents/prompts/templates/index.ts` — 私有属性访问重构
- `packages/core/src/hooks/types.ts` — 拆分为多个类型文件
- `packages/core/src/agents/types.ts` — 拆分为多个类型文件
- `packages/core/src/hooks/implementations/MonitoringHooks.ts` — ILogger 注入
- `packages/core/src/agents/prompts/PromptTemplate.ts` — ILogger 注入
- `packages/core/src/skills/loader.ts` — ILogger 注入
- `packages/core/src/providers/metadata/provider-registry.ts` — 移除硬编码 localhost
- `apps/server/src/gateway/http.ts` — 使用 WebhookHandler 接口
- `apps/server/src/config.ts` — 移除 deprecated 导出
- `apps/server/src/main.ts` — 更新 config 引用
