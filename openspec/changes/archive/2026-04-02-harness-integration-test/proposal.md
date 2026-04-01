## Why

Harness 层（retry + hint injection + serialize + 异常兜底）的单元测试全部使用 mock execute，从没让真实 rawTool（bash/file）跑过完整 harness 管道。安全拦截的 hint 格式、超时重试的 timing、权限控制的前缀 —— 这些都没在集成层面验证过。需要一个 Integration 测试层填补 unit 和 E2E 之间的空白。

## What Changes

- 新增 Integration 测试文件，覆盖 harness 管道的完整路径：`rawTool.execute → withHarness → retryWithBackoff → serializeToolResult → string`
- 真实执行 createRawBashTool / createRawFileTool（操作临时文件和简单命令），验证 ToolResult 序列化后的 string 格式
- 验证安全拦截（危险命令、敏感文件、权限控制）产生的 `[Security]`/`[Permission]` 前缀和 `[Hint]` 内容
- 验证超时场景的 retry 行为（mock child_process 超时，不依赖真实网络）
- 验证异常兜底（rawTool throw → harness 捕获 → 返回 `[Error]` string）

## Capabilities

### New Capabilities
- `harness-integration-test`: Harness 层集成测试 —— 真实 rawTool 经过完整管道后的输出验证

### Modified Capabilities
（无，不改现有行为，只增加测试覆盖）

## Non-goals

- 不测试 LLM 是否能根据 hint 自愈（这是 Level 2/3 E2E 的范围）
- 不修改 harness 层的任何实现代码
- 不增加新的测试框架或依赖

## Impact

- **影响范围**: 仅 `packages/core/tests/`，新增测试文件
- **CI**: Integration 测试跑在常规 `pnpm test` 中（不依赖真实 LLM API），无额外成本
- **依赖**: 无新依赖，使用现有 Vitest
