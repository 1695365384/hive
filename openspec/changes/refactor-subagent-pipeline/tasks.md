## 1. 类型定义与接口

- [x] 1.1 定义 `AgentPhaseResult` 接口（summary, keyFiles, findings, suggestions, rawText）
- [x] 1.2 定义 `CompactorConfig` 接口（model, preserveRaw, tokenBudget）
- [x] 1.3 定义 `PromptBuildContext` 接口（task, priorResults, agentType）
- [x] 1.4 更新 `WorkflowResult` 类型以包含结构化阶段结果

## 2. Context Compaction 引擎

- [x] 2.1 实现 `ContextCompactor` 类，支持 LLM 调用压缩
- [x] 2.2 编写压缩 prompt 模板（要求输出结构化 JSON）
- [x] 2.3 实现压缩失败 fallback 逻辑（原始文本截断 + 空数组）
- [x] 2.4 实现 `compressPhase(result: AgentResult, config): Promise<AgentPhaseResult>`
- [x] 2.5 为 ContextCompactor 编写单元测试

## 3. Dynamic Prompt Builder

- [x] 3.1 实现 `DynamicPromptBuilder` 类
- [x] 3.2 实现基础模板加载（复用 PromptTemplate）
- [x] 3.3 实现 `AgentPhaseResult` 格式化为 markdown sections
- [x] 3.4 实现 token budget 控制（超出时截断低优先级 sections）
- [x] 3.5 实现 `buildPrompt(context: PromptBuildContext): string`
- [x] 3.6 为 DynamicPromptBuilder 编写单元测试

## 4. AgentRunner 升级

- [x] 4.1 修改 `AgentRunner.execute()` 支持传入独立 messages 数组
- [x] 4.2 修改 `LLMRuntime.run()` 支持独立 messages 数组参数
- [x] 4.3 确保子 Agent 使用独立对话实例，不共享 messages
- [x] 4.4 为 AgentRunner 独立对话编写集成测试

## 5. WorkflowCapability 管道重构

- [x] 5.1 重构 `runComplexTask()` 使用 ContextCompactor 做阶段间压缩
- [x] 5.2 重构 `runExplorePhase()` 返回 `AgentPhaseResult` 而非 string
- [x] 5.3 重构 `runPlanPhase()` 接收 `AgentPhaseResult`，返回 `AgentPhaseResult`
- [x] 5.4 重构 `buildExecutePrompt()` 改用 DynamicPromptBuilder
- [x] 5.5 移除旧的文本拼接逻辑（`"探索发现:\n{exploreText}"`）
- [x] 5.6 确保简单任务路径（simple task）不受影响
- [x] 5.7 为 WorkflowCapability 管道重构编写集成测试

## 6. 模板更新

- [x] 6.1 更新 `intelligent.md` 模板，移除硬编码的上下文 section，改用动态注入
- [x] 6.2 确认 explore.md / plan.md / general.md 模板无需额外变量

## 7. 测试与验证

- [x] 7.1 运行全量单元测试确保无回归
- [x] 7.2 手动验证三子 Agent 管道完整流程
- [x] 7.3 验证压缩后上下文确实比原始文本短
- [x] 7.4 验证 fallback 路径（压缩失败时仍能正常工作）
