## 1. 类型定义

- [ ] 1.1 在 `packages/core/src/agents/types/capabilities.ts` 中为 DispatchResult 新增可选 `steps` 字段（类型与 RuntimeResult.steps 对齐）
- [ ] 1.2 在 `packages/core/src/agents/types/pipeline.ts` 中新增 `VerificationResult` 接口（pass/fail、失败原因、改进建议）和 `ClaimRule` 接口（声明关键词、必须工具名）
- [ ] 1.3 验证类型定义不破坏现有代码：`pnpm --filter @bundy-lmw/hive-core build` 通过

## 2. ExecutionCapability 保留 steps

- [ ] 2.1 修改 `ExecutionCapability.dispatch()` 中 RuntimeResult → DispatchResult 的映射逻辑，保留 `steps` 字段
- [ ] 2.2 验证现有功能不受影响：`pnpm test` 通过

## 3. 复杂度自评

- [ ] 3.1 在 `packages/core/src/agents/prompts/templates/intelligent.md` 中追加复杂度自评指令（`[x-simple]` / `[x-complex]` 标签说明）
- [ ] 3.2 在 ExecutionCapability 中新增 `parseComplexityTag(text: string)` 方法，正则提取标签，未匹配返回 `'simple'`
- [ ] 3.3 编写单元测试：匹配 simple、匹配 complex、无标签默认 simple、标签在输出中间而非末尾

## 4. Layer 1 规则验证器

- [ ] 4.1 在 ExecutionCapability 中新增 `ruleVerify(text: string, steps: StepResult[]): VerificationResult` 私有方法
- [ ] 4.2 实现声明关键词映射表（send-file、file(str_replace)、file(create)、bash、glob/grep、git push 等）
- [ ] 4.3 遍历映射表，检查声明文本是否包含关键词且 steps 中存在对应工具调用
- [ ] 4.4 编写单元测试：虚假完成检测（PASS）、声明与调用一致（FAIL）、无关键词匹配（PASS）、多种关键词组合

## 5. Layer 2 Haiku 语义验证器

- [ ] 5.1 在 ExecutionCapability 中新增 `semanticVerify(task: string, text: string, steps: StepResult[]): Promise<VerificationResult>` 私有方法
- [ ] 5.2 实现验证 Prompt 模板：输入原始任务 + Agent 输出 + steps 记录 + 可用工具列表，输出 PASS/FAIL + 原因
- [ ] 5.3 使用 Haiku 4.5 模型调用，解析结构化输出
- [ ] 5.4 编写单元测试（mock LLM 调用）：虚假拒绝检测、部分完成检测、结果满足要求

## 6. 验证循环集成

- [ ] 6.1 在 ExecutionCapability 中新增 `verifyResult(task: string, result: RuntimeResult): Promise<VerificationResult>` 方法，串联 L1 → L2 验证
- [ ] 6.2 新增 `buildFeedbackMessage(task: string, text: string, steps: StepResult[], reason: string)` 方法，构造反馈用户消息
- [ ] 6.3 修改 `dispatch()` 末尾：解析复杂度标签 → 复杂任务进入验证循环（最多 3 轮）→ 简单任务直接返回
- [ ] 6.4 验证循环中：PASS 返回结果、FAIL 注入反馈消息并重新调用 LLMRuntime、3 轮失败返回明确失败
- [ ] 6.5 编写集成测试：完整验证循环 PASS、1 轮失败后重试 PASS、3 轮全部失败返回失败

## 7. 端到端验证

- [ ] 7.1 `pnpm --filter @bundy-lmw/hive-core build` 通过
- [ ] 7.2 `pnpm test` 全部通过
- [ ] 7.3 验证简单任务不触发 Evaluator（无额外 LLM 调用）
