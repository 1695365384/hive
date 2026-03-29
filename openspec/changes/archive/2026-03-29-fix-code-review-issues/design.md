## Context

全量代码审查发现 25 个问题（4 CRITICAL + 10 HIGH + 11 MEDIUM）。问题集中在四个领域：

1. **SDK 安全**：`process.env` 完整暴露 + `bypassPermissions` 禁用所有安全限制
2. **API 安全**：HTTP/WebSocket 端点无任何认证
3. **数据安全**：CLI 输出部分 API Key、动态 SQL 拼接
4. **代码质量**：函数过长、副作用、缺失测试、类型安全

当前代码处于开发阶段，部分"安全特性"（如 bypassPermissions）可能是有意的开发便利选择。但必须修复后才适合任何非本地部署场景。

## Goals / Non-Goals

**Goals:**
- 消除所有 CRITICAL 级别安全漏洞
- 修复所有 HIGH 级别代码质量问题
- 修复可快速解决的 MEDIUM 问题（不引入重大架构变更）
- 为核心解析器/分类器补充缺失的单元测试

**Non-Goals:**
- 不替换 `cron-parser`（MEDIUM-2，标记 TODO 即可）
- 不重构 WebSocket 网关为完整实现（H-2，移除死代码）
- 不拆分 `cli.ts` 为多文件（H-8，仅标记）
- 不添加用户认证系统（仅 API Key 认证）
- 不重构 `processStream()` 为独立方法（H-7，仅拆分关键部分）

## Decisions

### D1: API Key 认证方案

**选择**: HTTP Header `Authorization: Bearer <apiKey>` + Query param `?apiKey=<key>` 双支持

**替代方案**:
- JWT Session 认证：过重，需要用户管理系统
- IP 白名单：不适合多客户端场景
- mTLS：过于复杂

**理由**: API Key 最简单，与现有 `config.apiKey` 配置自然对应。Query param 支持 WebSocket 握手场景。

### D2: SDK 环境变量最小化

**选择**: 构建白名单对象，仅传递 SDK 运行所需的变量

```typescript
const sdkEnv = {
  HOME: process.env.HOME,
  PATH: process.env.PATH,
  NODE_ENV: process.env.NODE_ENV,
  ...providerEnvVars, // 仅当前 provider 需要的 key/baseUrl
};
```

**理由**: SDK 只需要 API Key 和基础路径，不需要数据库密码、私钥等。

### D3: permissionMode 策略

**选择**: 改为 `'default'`，保留 `allowedTools` 白名单配置项

**替代方案**:
- 保持 `bypassPermissions` + 添加沙箱：实现复杂
- 完全移除 SDK 工具调用：功能退化

**理由**: `'default'` 是 SDK 安全默认值。通过 `allowedTools` 可灵活配置允许的工具集。

### D4: 插件路径校验

**选择**: 限制为相对路径，拒绝绝对路径和 `..` 遍历

```typescript
function validatePluginPath(name: string): boolean {
  if (path.isAbsolute(name)) return false;
  if (name.includes('..')) return false;
  return /^[a-z0-9@/-]/i.test(name);
}
```

### D5: ScheduleRepository 动态 SQL

**选择**: 使用白名单列映射对象，禁止任意字段更新

```typescript
const ALLOWED_COLUMNS: Record<string, string> = {
  name: 'name', cron: 'cron', prompt: 'prompt', /* ... */
};
```

## Risks / Trade-offs

- **[permissionMode='default' 影响 UX]** → 现有测试和开发工作流中工具调用需要确认。通过配置项 `permissionMode` 允许覆盖为 `bypassPermissions`（仅限开发环境）。
- **[API Key 认证 BREAKING]** → 现有客户端需要适配。在迁移期间支持配置 `auth.enabled: false` 禁用认证。
- **[extractJSON 反引号修复]** → 可能影响现有的 LLM 输出解析行为。需通过测试验证。
- **[fallbackParseV2 不再硬编码 cron]** → 用户输入模糊时始终要求确认，不再静默创建 9AM 任务。这是正确行为但改变了交互流程。
