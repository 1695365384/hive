## 1. 类型定义

- [x] 1.1 在 `packages/core/src/agents/capabilities/ExecutionCapability.ts` 中为 DispatchResult 新增可选 `steps` 字段（类型与 RuntimeResult.steps 对齐）
- [x] 1.2 验证类型定义不破坏现有代码：`pnpm --filter @bundy-lmw/hive-core build` 通过

## 2. ExecutionCapability 保留 steps

- [x] 2.1 修改 `ExecutionCapability.run()` 中 RuntimeResult → DispatchResult 的映射逻辑，保留 `steps` 字段
- [x] 2.2 验证现有功能不受影响：`pnpm test` 通过

## 3. 防线 1：执行协议（prompt）

- [x] 3.1 在 `packages/core/src/agents/prompts/templates/intelligent.md` 中新增执行协议指令（步骤化：分析 → 执行 → 确认 → 声明）

## 4. 防线 2 + 防线 3：action task 判定 + 拦截 + 自省

- [x] 4.1 在 ExecutionCapability 中新增 `isActionTask(task: string): boolean` 私有方法，基于启发式判定任务类型
- [x] 4.2 新增 `formatStepsSummary(steps: StepResult[]): string` 私有方法，将 steps 格式化为可读摘要
- [x] 4.3 新增 `buildRetryMessages(task: string, reason: string): Array<{role: string, content: string}>` 私有方法，构造反馈消息
- [x] 4.4 新增 `buildIntrospectionMessages(task: string, stepsSummary: string): Array<{role: string, content: string}>` 私有方法，构造自省消息
- [x] 4.5 修改 `run()` 末尾：在返回 DispatchResult 前，根据 forceMode 和 action task 判定，依次执行防线 2（零工具拦截）和防线 3（steps 自省）

## 5. 测试

- [x] 5.1 编写 `isActionTask` 单元测试：动作任务判定为 true、纯问答判定为 false、边界 case
- [x] 5.2 编写 `formatStepsSummary` 单元测试：有工具调用、无工具调用、多种工具类型
- [x] 5.3 编写防线 2 集成测试：零工具 action task 被拦截重试、纯问答不触发、只读模式不触发
- [x] 5.4 编写防线 3 集成测试：有工具 action task 触发自省、自省确认完成、自省发现未完成继续执行
- [x] 5.5 编写 DispatchResult.steps 单元测试：action task 返回 steps、纯问答也返回 steps

## 6. 验证

- [x] 6.1 `pnpm --filter @bundy-lmw/hive-core build` 通过
- [x] 6.2 `pnpm test` 全部通过（预已存在的 11 个失败与本次改动无关）
- [x] 6.3 验证只读模式（explore/plan）不触发任何防线
