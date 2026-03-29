## 1. Layer 1: LLM 分类器 Prompt 改进

- [x] 1.1 重写 DISPATCH_SYSTEM_PROMPT：翻转 safe default 为 `uncertain → chat`，添加 6-8 个中英双语 few-shot 示例（问候、闲聊、问答、代码任务各 2 个）
- [x] 1.2 更新 DEFAULT_CLASSIFICATION 的 reason 文本，与新 Prompt 策略一致

## 2. Layer 2: WorkflowCapability analyzeTask 增强

- [x] 2.1 扩展 analyzeTask() 增加短消息判断：`< 30 字符` 且不包含操作动词（修复/实现/重构/添加/创建/删除/优化/排查/调试）→ `type: 'simple'`
- [x] 2.2 保留原有 `endsWith('?')` 判断作为问题类 simple 的识别

## 3. 测试

- [x] 3.1 添加 Dispatcher 分类器测试：验证 "你好啊"、"谢谢"、"在吗"、"hello" 被路由到 chat 层
- [x] 3.2 添加 WorkflowCapability.analyzeTask() 测试：验证短问候消息返回 simple，带操作动词的短消息返回 moderate
- [x] 3.3 运行现有测试确保无回归：`npm test`

## 4. 验证

- [x] 4.1 运行全量测试确认通过
- [x] 4.2 关闭 GitHub Issue #36
