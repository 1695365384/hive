## 1. Git 卫生 — 修复敏感文件跟踪 (git-hygiene)

- [x] 1.1 更新 `.gitignore`：添加 `.hive/`、`*.env`（排除 `.env.example`）规则
- [x] 1.2 执行 `git rm --cached` 移除 `packages/core/.hive/hive.db`、`packages/core/.hive/hive.db-shm`、`packages/core/.hive/hive.db-wal`
- [x] 1.3 执行 `git rm --cached apps/server/.env`（如存在）
- [x] 1.4 验证：`git ls-files | grep -E '\.(db|env)$'` 输出为空

## 2. 基础设施 — ILogger 接口与安全 JSON 解析 (logger-injection, safe-json-parsing)

- [x] 2.1 在 `packages/core/src/utils/` 中创建 `safe-json-parse.ts`，实现 `safeJsonParse<T>(json: string, fallback: T): T`
- [x] 2.2 在 `packages/core/src/types/` 中定义 `ILogger` 接口（debug/info/warn/error）和 `noopLogger` 默认实现
- [x] 2.3 从 `packages/core/src/index.ts` 导出 ILogger 和 safeJsonParse
- [x] 2.4 编写 `safeJsonParse` 单元测试（正常 JSON、无效 JSON、null 输入）
- [x] 2.5 编写 ILogger noop 实现测试

## 3. 类型安全存储层 (type-safe-storage)

- [x] 3.1 在 `packages/core/src/storage/` 中创建 `types.ts`，定义 `SessionRow`、`MessageRow` 接口
- [x] 3.2 重构 `SessionRepository.ts`：将所有 `as any` 替换为泛型类型参数（`.get<SessionRow>()`、`.all<MessageRow>()`）
- [x] 3.3 重构 `MemoryRepository.ts`：将所有 `as any` 替换为正确的类型
- [x] 3.4 在 `SessionRepository.rowToSession()` 中将重复的 `JSON.parse(sessionRow.compression_state)` 提取为单次解析
- [x] 3.5 用 `safeJsonParse` 替换所有无保护的 `JSON.parse` 调用
- [x] 3.6 验证：`grep -rn 'as any' packages/core/src/storage/` 输出为空
- [x] 3.7 运行现有测试确保无回归

## 4. 消除 Non-null Assertion (type-safe-storage)

- [x] 4.1 重构 `SessionCapability.ts`：在 `ensureAsyncInitialized()` 之后添加 guard clause 替代所有 `this.sessionManager!.`
- [x] 4.2 重构 `SessionManager.ts`：在访问 `this.currentSession` 的方法中添加存在性检查
- [x] 4.3 重构 `WorkspaceManager.ts`：将 `this.metadata!.` 替换为 guard clause
- [x] 4.4 验证：`grep -rn '!\\.' packages/core/src/ --include='*.ts' | grep -v node_modules | grep -v '!= '` 输出为空

## 5. 不可变会话状态 (immutable-session-state)

- [x] 5.1 重构 `SessionManager.addMessage()`：使用展开运算符创建新的 messages 数组和 session 对象
- [x] 5.2 重构 `SessionManager` 中所有直接修改 `currentSession` 的地方（messages.push、updatedAt 赋值、metadata 修改）
- [x] 5.3 运行现有会话相关测试确保无回归
- [ ] 5.4 为不可变行为编写专门的单元测试（验证原对象不变）

## 6. 资源生命周期管理 (resource-lifecycle)

- [x] 6.1 在 `packages/core/src/agents/core/types.ts` 中定义 `IDisposable` 接口
- [x] 6.2 为 `TimeoutCapability` 添加 `dispose()` 方法：清除 heartbeatTimer、stallTimer、executionTimer
- [x] 6.3 为 `AuditHooks` 添加 `dispose()` 方法：flush 缓冲区后清除 flushTimer
- [x] 6.4 修改 `AgentContextImpl` 的关闭流程：调用所有实现了 `IDisposable` 的 capability 的 `dispose()`
- [x] 6.5 编写 dispose 相关测试（验证 timer 被清除、idempotent 调用）

## 7. Logger 注入 (logger-injection)

- [x] 7.1 修改 `ProviderManager` 构造函数：接受可选 `ILogger` 参数，默认使用 noopLogger
- [x] 7.2 替换 `ProviderManager.ts` 中所有 `console.error`/`console.warn` 为 `this.logger.error()`/`this.logger.warn()`
- [x] 7.3 替换 `packages/core/src/providers/sources/models-dev.ts` 中的 console 调用为 logger
- [x] 7.4 替换 `packages/core/src/providers/metadata/models-dev.ts` 中的 console 调用为 logger
- [x] 7.5 替换 `packages/core/src/providers/metadata/provider-registry.ts` 中的 console 调用为 logger
- [x] 7.6 验证：ProviderManager 和 providers 子模块中无 console 调用（hooks/registry 中的 console.error 作为错误边界保留）
- [x] 7.7 更新相关测试以传入 mock logger

## 8. 可测试配置模块 (testable-config)

- [x] 8.1 重构 `apps/server/src/config.ts`：将 `export const config = loadConfig()` 改为 `getConfig()` 懒加载 + `resetConfig()` 重置
- [x] 8.2 为 `DatabaseManager` 添加 `static resetInstances()` 方法
- [x] 8.3 在测试 setup 中调用 `resetConfig()` 和 `resetInstances()` 确保测试隔离
- [x] 8.4 更新所有引用 `config` 的地方改为 `getConfig()`
- [x] 8.5 运行 server 测试确保无回归

## 9. 测试文件命名统一 (type-safe-storage)

- [x] 9.1 重命名 `TimeoutCapability.test.ts` → `timeout-capability.test.ts`
- [x] 9.2 检查并重命名其他不符合 kebab-case 的测试文件
- [x] 9.3 验证：所有 `*.test.ts` 文件名匹配 `/^[a-z0-9-]+\.test\.ts$/`

## 10. 最终验证

- [x] 10.1 运行全量测试套件 `npm test` — 640 tests passed
- [ ] 10.2 运行 E2E 测试 `npm run test:e2e`（需要 API Key 配置）
- [x] 10.3 运行构建 `npm run build` — 全部通过
- [x] 10.4 最终检查：`as any` 零结果
- [x] 10.5 最终检查：无敏感文件被 Git 跟踪
