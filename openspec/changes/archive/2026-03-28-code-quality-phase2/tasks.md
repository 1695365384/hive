## 1. 消除剩余 as any — validator.ts (type-file-split)

- [x] 1.1 将 `config/validator.ts` 中 `formatErrors(errors: any[])` 替换为 `formatErrors(errors: Ajv.ErrorObject[])`
- [x] 1.2 将 `ajv.compile(getAgentConfigSchema() as any)` 替换为正确的 AJV schema 类型
- [x] 1.3 将 `ajv.compile(getProviderConfigSchema() as any)` 替换为正确的 AJV schema 类型
- [x] 1.4 验证：`grep -n 'as any' packages/core/src/config/validator.ts` 输出为空

## 2. 消除剩余 as any — templates/index.ts (type-file-split)

- [x] 2.1 分析 `(template as any).cache` 的使用场景，确定正确的类型
- [x] 2.2 为模板缓存添加类型安全的访问方式（如导出 cache 属性或添加 getter）
- [x] 2.3 移除 `as any` 断言
- [x] 2.4 验证构建通过

## 3. WebhookHandler 接口 (webhook-handler-interface)

- [x] 3.1 在 `packages/core/src/plugins/types.ts` 中定义 `IWebhookHandler` 接口
- [x] 3.2 在 `packages/core/src/plugins/index.ts` 和 `packages/core/src/index.ts` 中导出
- [x] 3.3 重构 `apps/server/src/gateway/http.ts`：使用 `IWebhookHandler` 接口替代 `as any`
- [x] 3.4 验证飞书插件的 `handleWebhook` 签名与接口兼容
- [x] 3.5 验证：`grep -n 'as any' apps/server/src/gateway/http.ts` 输出为空

## 4. hooks/types.ts 拆分 (type-file-split)

- [x] 4.1 创建 `packages/core/src/hooks/types/` 目录
- [x] 4.2 将审计相关类型提取到 `hooks/types/audit.ts`
- [x] 4.3 将监控相关类型提取到 `hooks/types/monitoring.ts`
- [x] 4.4 将安全相关类型提取到 `hooks/types/security.ts`
- [x] 4.5 将限流相关类型提取到 `hooks/types/rate-limiter.ts`
- [x] 4.6 将 `hooks/types.ts` 改为 barrel re-export 文件
- [x] 4.7 验证：每个文件不超过 300 行，构建通过，测试通过

## 5. agents/types.ts 拆分 (type-file-split)

- [x] 5.1 创建 `packages/core/src/agents/types/` 目录
- [x] 5.2 将能力相关类型提取到 `agents/types/capabilities.ts`
- [x] 5.3 将执行器相关类型提取到 `agents/types/runner.ts`
- [x] 5.4 将 `agents/types.ts` 改为 barrel re-export 文件
- [x] 5.5 验证：每个文件不超过 300 行，构建通过，测试通过

## 6. MonitoringHooks Logger 注入 (logger-injection-phase2)

- [x] 6.1 修改 `MonitoringHooks` 构造函数：接受可选 `ILogger`，默认 `noopLogger`
- [x] 6.2 替换 4 处 `console.log` 为 `this.logger.info()`
- [x] 6.3 验证：`grep -n 'console\\.log' MonitoringHooks.ts` 输出为空

## 7. PromptTemplate Logger 注入 (logger-injection-phase2)

- [x] 7.1 修改 `PromptTemplate` 类：添加可选 `logger` 参数
- [x] 7.2 替换 `console.warn` 为 `this.logger.warn()`
- [x] 7.3 验证：`grep -n 'console\\.warn' PromptTemplate.ts` 输出为空

## 8. SkillLoader Logger 注入 (logger-injection-phase2)

- [x] 8.1 修改 `SkillLoader` 构造函数：接受可选 `ILogger`，默认 `noopLogger`
- [x] 8.2 替换 `console.warn` 为 `this.logger.warn()`
- [x] 8.3 验证：`grep -n 'console\\.warn' loader.ts` 输出为空

## 9. 清理 deprecated 导出 (logger-injection-phase2)

- [x] 9.1 删除 `apps/server/src/config.ts` 中的 `export const config` 和 `@deprecated` 注释
- [x] 9.2 删除 `apps/server/src/main.ts` 中的 `export { getConfig as config }`
- [x] 9.3 搜索 monorepo 内所有对 `config` 直接导入的引用，确保全部使用 `getConfig()`
- [x] 9.4 验证构建通过

## 10. 移除硬编码 localhost (logger-injection-phase2)

- [x] 10.1 将 `provider-registry.ts:86` 的 `http://localhost:4000/v1` 替换为空字符串
- [x] 10.2 验证：`grep -n 'localhost' packages/core/src/providers/metadata/provider-registry.ts` 输出为空

## 11. 最终验证

- [x] 11.1 运行全量测试 — 640 tests passed
- [x] 11.2 运行构建 — 全部通过
- [x] 11.3 `as any` = 0（core + server）
- [x] 11.4 console 调用仅剩错误边界 + 1 处代码注释
