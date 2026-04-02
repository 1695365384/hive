## 1. 类型定义

- [x] 1.1 在 `tool-categories.ts` 中新增 `native-app` 到 `ToolCategory` 类型
- [x] 1.2 移除硬编码的 `NATIVE_APPS` 注册表、`NativeAppEntry` 接口和 `getNativeAppRegistry()`

## 2. 原生应用动态发现

- [x] 2.1 重写 `native-app-scanner.ts`：macOS 用 `fs.readdirSync(/Applications/*.app)` 动态发现，Windows 枚举 Start Menu，Linux 解析 .desktop 文件
- [x] 2.2 平台级访问命令模板（macOS: osascript, Windows: start, Linux: gio launch），一个规则适用所有应用
- [x] 2.3 设置 MAX_APPS=200 限制，防止数据库膨胀
- [x] 2.4 集成到 `scanEnvironment()` 并发执行（已就绪，Promise.all）

## 3. env-tool 概览模式

- [x] 3.1 `VALID_CATEGORIES` 新增 `'native-app'`
- [x] 3.2 新增 `queryOverview()` 函数：`SELECT category, COUNT(*) FROM env_tools GROUP BY category ORDER BY count DESC`
- [x] 3.3 无参数调用返回 category 摘要 + 使用提示
- [x] 3.4 native-app 输出格式：`path` 列显示为 `access: \`command\``

## 4. Prompt 方法论引导

- [x] 4.1 `DynamicPromptBuilder.formatEnvironment()` 末尾追加引导句
- [x] 4.2 `EnvironmentContext` 新增 `categorySummary` 字段
- [x] 4.3 `ServerImpl.ts` Phase 2 完成后读取 category 摘要注入 environmentContext
- [x] 4.4 `formatEnvironment()` 展示 Discovered Capabilities 行
- [x] 4.5 env 工具描述明确提及 native applications
- [x] 4.6 引导句强化为 "Always call env() before interacting with unfamiliar applications or services"

## 5. 测试

- [x] 5.1 为动态发现编写单元测试：覆盖 macOS 发现、Windows 发现、Linux 发现、最大限制、非支持平台
- [x] 5.2 为平台级访问命令模板编写单元测试
- [x] 5.3 为 env-tool 概览模式编写单元测试：覆盖无参数调用、数据库为空、数据库有数据
- [x] 5.4 为 env-tool 的 `native-app` 查询编写单元测试：覆盖 category 查询和 keyword 搜索
- [x] 5.5 为 `formatEnvironment()` 方法论引导编写单元测试
- [x] 5.6 运行全量测试确认无回归

## 6. 构建与验证

- [x] 6.1 `pnpm --filter @bundy-lmw/hive-core build` 确认编译通过
- [x] 6.2 `pnpm test` 确认所有测试通过
