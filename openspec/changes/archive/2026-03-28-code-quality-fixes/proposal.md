## Why

Hive core 代码库存在多个软件工程违规，影响类型安全、安全性、可维护性和可测试性。作为面向外部消费的 SDK 库，这些问题会直接传导给下游使用者，降低项目可信度。现在修复可以在功能膨胀之前建立正确的工程基线。

## What Changes

- **修复 Git 跟踪敏感文件**：将 `.hive/` 目录和 `.env` 文件从版本控制中移除，添加到 `.gitignore`
- **消除存储层 `as any`**：为 SQLite 查询结果定义类型接口，替换所有 `as any` 断言
- **移除非空断言 `!.`**：用正确的 null 检查和早期返回模式替代 `sessionManager!.` 和 `currentSession!.` 等
- **消除直接状态修改**：SessionManager 中的 `push()`/属性赋值改为返回新对象的不可变操作
- **添加 JSON.parse 安全包装**：所有 `JSON.parse` 调用增加 try-catch 或使用安全解析函数
- **修复 Timer 资源泄漏**：为 TimeoutCapability 和 AuditHooks 添加完整的 dispose/cleanup 方法
- **替换 console 直接调用**：ProviderManager 中的 `console.error/warn` 改为注入 logger 接口
- **消除模块级副作用**：config.ts 的 `export const config = loadConfig()` 改为延迟初始化
- **修复 DatabaseManager 单例测试隔离**：提供 `reset()` 方法用于测试清理
- **统一测试文件命名**：`TimeoutCapability.test.ts` → `timeout-capability.test.ts`
- **消除重复 JSON.parse**：SessionRepository 中同一字段多次 parse 改为一次解析复用

## Capabilities

### New Capabilities

- `git-hygiene`: 修复 .gitignore 规则，从 Git 历史中移除敏感文件
- `type-safe-storage`: 存储层类型安全改造（消除 as any，定义 DatabaseRow 接口）
- `immutable-session-state`: 会话状态不可变化改造（消除直接 mutation）
- `safe-json-parsing`: JSON.parse 安全包装与错误处理
- `resource-lifecycle`: Timer/连接等资源的完整生命周期管理
- `logger-injection`: 库代码日志接口注入（替代 console 直接调用）
- `testable-config`: 配置模块延迟初始化与单例可测试化

### Modified Capabilities

_无现有 spec 需要修改_

## Impact

- **packages/core/src/storage/**：SessionRepository、MemoryRepository 类型签名变更
- **packages/core/src/session/**：SessionManager 内部实现改为不可变模式
- **packages/core/src/agents/capabilities/**：SessionCapability、TimeoutCapability API 不变但内部实现调整
- **packages/core/src/providers/ProviderManager.ts**：构造函数增加 logger 参数
- **apps/server/src/config.ts**：导出改为函数调用
- **测试文件**：重命名 + 适配新的类型接口
- **.gitignore**：新增规则
- **下游消费者**：SessionManager 的 mutation 模式变更可能影响依赖内部行为的代码（但公开 API 不变）
