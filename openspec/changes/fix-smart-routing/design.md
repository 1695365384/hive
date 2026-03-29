## Context

Hive Agent 的任务路由分两层：Dispatcher 将消息分类到 chat/workflow 层，WorkflowCapability 内部再判断走 simple 直接执行还是 complex 三子代理。当前两层均存在缺陷，导致简单问候被路由到完整三子代理流程（3-10 次 LLM 调用）。

### 当前状态

```
用户消息 → Dispatcher.classify()
              ├─ LLM classifyForDispatch() → DISPATCH_SYSTEM_PROMPT
              │   问题: safe default = workflow, 无 few-shot
              └─ fallback regexClassify()
                  问题: 只认 "?" 结尾和代码关键词
            → WorkflowCapability.analyzeTask()
                问题: 只看 task.endsWith('?') 判断 simple
```

## Goals / Non-Goals

**Goals:**
- LLM 分类器准确识别问候/闲聊/简单问答为 chat 层
- WorkflowCapability 内部对明确简单的任务短路，不启动 explore/plan
- 双重保险：即使一层失效，另一层仍能拦截

**Non-Goals:**
- 不引入额外的 LLM 调用（不增加延迟）
- 不改变 chat/workflow 的 API 接口
- 不重构 Dispatcher 或 WorkflowCapability 的整体架构

## Decisions

### D1: 翻转 safe default 方向

**选择**: `uncertain → chat`

**替代方案**: `uncertain → workflow`（当前）, 按任务长度/复杂度分级

**理由**: chat 是 1 次 LLM 调用，workflow 是 3-10 次。误判 chat→workflow 的代价（延迟 + token）远大于反过来。对于真正需要 workflow 的复杂任务，LLM 应有足够信心返回高置信度。

### D2: 在 Prompt 中添加 few-shot 示例

**选择**: 6-8 个中英双语示例覆盖 chat 和 workflow 两类

**替代方案**: 仅改进规则描述（无示例），使用 structured output

**理由**: few-shot 是提升分类准确率最直接有效的方式，尤其是对中文模型处理英文 prompt 的场景。示例覆盖问候、闲聊、简单问答、代码任务四种模式。

### D3: analyzeTask 扩展 simple 判断条件

**选择**: 增加短消息 + 无操作动词的组合判断

**替代方案**: 在 analyzeTask 中也调用 LLM，用正则匹配问候语

**理由**: LLM 调用会增加延迟（与 Goal 冲突），正则匹配不够通用。短消息（< 30 字）+ 不包含操作动词（修复、实现、重构等）的组合启发式，能覆盖问候/闲聊场景且零延迟。

## Risks / Trade-offs

- **[复杂任务误判为 chat]** → 真正需要 workflow 的任务（如 "帮我看看这个模块"）可能被判为 chat。但 chat 层的 general agent 也有完整工具能力，可以处理大部分任务。极端情况下用户可以重发更明确的指令。
- **[few-shot 示例过时]** → 示例需要随产品迭代更新。定期 review 即可。
- **[analyzeTask 启发式不完美]** → 作为第二道防线，不需要完美。第一道防线（LLM 分类器）承担主要分类职责。
