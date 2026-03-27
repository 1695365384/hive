## Context

Hive 是一个多 Agent 协作框架，`@hive/core` 作为 SDK 包被 `apps/server` 和 `packages/plugins` 消费。当前代码在类型安全、安全性、资源管理方面存在系统性问题，源于早期快速迭代阶段缺少工程规范约束。

核心问题分布：
- 存储层（`storage/`）：10+ 处 `as any`，JSON.parse 无保护
- 会话管理（`session/`）：直接 mutation，non-null assertion 泛滥
- 能力模块（`capabilities/`）：Timer 资源无 cleanup
- 配置（`config.ts`）：模块级副作用，单例不可测试
- 安全（`.gitignore`）：数据库和 .env 文件入库

## Goals / Non-Goals

**Goals:**
- 消除所有 `as any` 类型断言，建立类型安全的存储层
- 消除所有 non-null assertion `!.`
- 会话状态操作改为不可变模式
- 所有资源（Timer、DB 连接）具备完整生命周期
- 库代码不直接使用 `console.*`，通过接口注入
- 敏感文件不再被 Git 跟踪
- 配置模块支持延迟加载和测试注入

**Non-Goals:**
- 不重构整体架构（委托模式保持不变）
- 不添加 ESLint/Prettier（单独 change 处理）
- 不拆分大文件（hooks/types.ts 等留待后续）
- 不修改公开 API 签名（消费者无感知）
- 不处理 TODO 注释（非阻塞性）

## Decisions

### D1: 存储层类型安全 — 定义 Row 接口 + 泛型查询

**选择**: 为每张表定义 `DatabaseRow` 接口，配合 `better-sqlite3` 的 `.get<T>()` 和 `.all<T>()` 泛型。

**替代方案**:
- A) 使用 ORM（Drizzle/TypeORM）→ 过重，增加依赖
- B) 运行时 schema 验证（Zod）→ 增加运行时开销，编译时已覆盖

**理由**: 零依赖，编译时类型检查，与现有 better-sqlite3 用法完全兼容。

```typescript
// 新增类型
interface SessionRow {
  id: string;
  created_at: string;
  updated_at: string;
  title: string | null;
  metadata: string | null;
  compression_state: string | null;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: string;
  token_count: number | null;
}
```

### D2: 不可变会话状态 — 新对象替代 mutation

**选择**: SessionManager 方法返回新的 Session 对象，内部使用 `structuredClone` 或展开运算符。

**替代方案**:
- A) Immer → 增加依赖
- B) 完全函数式（每次传递 session 参数）→ API 变化太大

**理由**: 保持现有 API，仅改变内部实现。调用方代码无需修改。

```typescript
// Before (mutation)
this.currentSession!.messages.push(message);
this.currentSession!.updatedAt = new Date();

// After (immutable)
this.currentSession = {
  ...this.currentSession!,
  messages: [...this.currentSession!.messages, message],
  updatedAt: new Date(),
};
```

### D3: 非 null 断言 — Guard clause 模式

**选择**: 在每个 public 方法入口添加 guard clause，确保前置条件。

**理由**: 比可选链 `?.` 更早暴露错误，比 `!.` 提供更好的错误信息。

```typescript
// Before
return this.sessionManager!.createSession(config);

// After
if (!this.sessionManager) {
  throw new Error('SessionManager not initialized. Call init() first.');
}
return this.sessionManager.createSession(config);
```

### D4: Timer 资源管理 — IDisposable 接口

**选择**: 定义 `IDisposable` 接口，TimeoutCapability 和 AuditHooks 实现 `dispose()` 方法。

```typescript
interface IDisposable {
  dispose(): void;
}
```

TimeoutCapability.dispose() 清除 heartbeatTimer 和 stallTimer。AuditHooks.dispose() 清除 flushTimer。AgentContext 在关闭时调用所有 capability 的 dispose()。

### D5: Logger 注入 — 可选 ILogger 参数

**选择**: ProviderManager 构造函数接受可选的 `ILogger` 接口，默认使用 noop logger。

**替代方案**:
- A) 全局 logger 单例 → 测试困难
- B) 依赖注入容器 → 过度工程化

**理由**: 最小侵入性，保持向后兼容（可选参数），测试时可注入 mock logger。

```typescript
interface ILogger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

const noopLogger: ILogger = {
  debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
};
```

### D6: 配置延迟初始化 — 工厂函数

**选择**: 移除 `export const config = loadConfig()`，改为 `export function getConfig()` 懒加载单例。

```typescript
let _config: ServerConfig | null = null;
export function getConfig(): ServerConfig {
  if (!_config) _config = loadConfig();
  return _config;
}
export function resetConfig(): void { _config = null; } // for testing
```

### D7: Git 清理 — git rm + .gitignore

**选择**: `git rm --cached` 移除已跟踪文件，添加 `.hive/` 和 `*.env` 到 .gitignore。不使用 `git filter-branch` 重写历史（风险高，团队影响大）。

**理由**: 简单有效，历史中的数据已在（需提醒团队注意），未来不再跟踪。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 存储层类型变更可能导致运行时类型不匹配 | 充分的单元测试覆盖 + 集成测试验证 |
| 不可变操作增加对象创建开销 | Session 数据量小（消息列表通常 < 100），性能影响可忽略 |
| Guard clause 改变错误抛出位置 | 错误类型保持 Error，消息更明确 |
| DatabaseManager.reset() 仅用于测试 | 标记为 `@internal`，不在公开 API 中 |
| Git 历史中仍有敏感文件 | 在 README 和 CONTRIBUTING.md 中提醒，考虑后续 BFG 清理 |
