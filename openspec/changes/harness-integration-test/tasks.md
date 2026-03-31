## 1. 测试基础设施

- [x] 1.1 创建 `packages/core/tests/unit/tools/harness-integration.test.ts` 文件骨架，包含 tmpdir beforeEach/afterEach 生命周期
- [x] 1.2 编写辅助函数 `pipeline(rawTool, input)` 组合 rawTool.execute + serializeToolResult，返回最终 string

## 2. BashTool 集成测试

- [x] 2.1 测试成功执行命令 → `[OK]` 前缀验证
- [x] 2.2 测试非零退出码命令 → stdout+stderr 合并输出
- [x] 2.3 测试危险命令拦截 → `[Security]` + `[Hint]` 验证
- [x] 2.4 测试权限拦截（allowed: false）→ `[Permission]` 验证

## 3. FileTool 集成测试

- [x] 3.1 测试创建文件 → `[OK]` 验证
- [x] 3.2 测试查看文件 → `[OK]` + 文件内容验证
- [x] 3.3 测试替换文件内容 → `[OK]` 验证
- [x] 3.4 测试替换失败（MATCH_FAILED）→ `[Error]` + `[Hint]` 含文件路径
- [x] 3.5 测试查看不存在的文件（NOT_FOUND）→ `[Error]` + `[Hint]`
- [x] 3.6 测试敏感文件拦截（SENSITIVE_FILE）→ `[Security]` + `[Hint]`
- [x] 3.7 测试只读权限控制（PERMISSION）→ `[Permission]` + `[Hint]`

## 4. Retry 集成测试

- [x] 4.1 测试超时场景 → TIMEOUT 错误码 + isRetryable 验证
- [x] 4.2 测试 retryWithBackoff 对 TRANSIENT 错误的重试行为

## 5. 异常兜底测试

- [x] 5.1 测试 rawTool throw → withHarness 捕获 → `[Error]` + `工具内部异常`

## 6. 验证

- [x] 6.1 运行 `npx vitest run packages/core/tests/unit/tools/harness-integration.test.ts` 全部通过
- [x] 6.2 运行 `pnpm test` 全量测试通过，无回归
