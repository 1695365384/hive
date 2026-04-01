# GAN Discriminator 验证循环设计

## 问题背景

大模型 Agent 存在声明式幻觉——声称完成了操作但实际未执行。典型表现：

- **虚假完成**：声称"图片已发送"但未调用 send-file 工具
- **虚假拒绝**：声称"做不到"但实际有对应工具可以完成
- **部分完成**：声称"已修改 3 个文件"但实际只改了 1 个

## 设计思路

借鉴 GAN（生成对抗网络）的对抗训练理念，将三个子 Agent 映射为 Generator/Discriminator 角色：

```
                 Generator 侧                    Discriminator 侧
┌──────────┐    ┌──────────┐    ┌──────────┐
│ Explore  │    │   Plan   │    │ Evaluator │
│ 收集信息  │    │ 制定方案  │    │ 验证结果  │
└────┬─────┘    └────┬─────┘    └─────┬─────┘
     │               │                  │
     └───────┬───────┘                  │
             ▼                          │
     ┌──────────────┐                   │
     │  Main Agent   │──最终结果────────▶│
     │  执行任务     │                   │
     └──────────────┘                   │
             ▲                          │
             │      反馈 + 改进建议      │
             └──────────────────────────┘
                  (验证失败时)
```

- **Generator**：Explore + Plan + Main Agent（产出结果）
- **Discriminator**：Evaluator（基于事实验证结果）
- **对抗循环**：生成 → 验证 → 反馈 → 重新生成

## 完整流程

```
Task 进入
    │
    ▼
┌─────────────────────────────────┐
│ Main Agent 自评复杂度             │
│ 输出末尾: [x-simple] 或 [x-complex]│
└───────────┬─────────────────────┘
            │
    ┌───────┴───────────┐
    │                   │
[x-simple]          [x-complex]
    │                   │
    ▼                   ▼
┌──────────┐    ┌──────────────────────┐
│ Main Agent│    │ ① Main Agent 执行     │
│ 直接处理   │    │    ├── Explore 子Agent │
│ 不进入     │    │    ├── Plan 子Agent   │
│ 任何子Agent│    │    └── 执行工具调用     │
│ 不经过     │    └──────────┬───────────┘
│ Evaluator  │               ▼
│           │    ┌──────────────────────┐
└─────┬─────┘    │ ② Evaluator 验证      │
      │         │    验证循环 (最多 3 轮)  │
      │         └──────────┬───────────┘
      │              ┌─────┴─────┐
      │            PASS        FAIL
      │              │           │
      ▼              ▼           ▼
   返回结果      返回结果    返回明确失败
```

### 简单任务

- 不触发 Explore、Plan、Evaluator 任何子 Agent
- Main Agent 直接处理并返回结果
- 向后兼容：未标注复杂度标签时默认走简单路径

### 复杂任务

1. Main Agent 可按需调用 Explore / Plan 子 Agent 收集上下文
2. Main Agent 执行工具调用完成任务
3. Evaluator 验证最终结果（两层验证）
4. 验证失败 → 反馈注入对话历史 → Main Agent 重试
5. 最多 3 轮，超过返回明确失败

## Evaluator 验证机制

### Layer 1：规则验证器（零成本，确定性）

声明关键词 vs 实际工具调用记录比对：

| 声明模式 | 必须存在的工具调用 |
|----------|-------------------|
| "发送了/已发送" | send-file |
| "修改了/已修改" | file(str_replace / insert) |
| "创建了/新建了" | file(create) |
| "删除了/移除了" | bash(rm) / file |
| "执行了/运行了" | bash |
| "搜索了/查找了" | glob / grep |
| "推送了/提交了" | bash(git push) |

### Layer 2：语义验证器（Haiku 4.5，低成本）

检查规则验证器无法覆盖的情况：

- Agent 声称"做不到"但 toolRegistry 里有对应工具
- Agent 的结果是否真正满足用户需求
- 是否遗漏了关键步骤

输入：原始任务 + Agent 声明 + 完整工具调用记录（steps[]）

## 重试机制

重试时以用户消息形式追加完整上下文到对话历史：

```
[验证反馈]

你的上一次执行未通过验证：

原始任务: {task}

你的声明: "图片已发送，报告已完成"

实际工具调用记录:
  Step 1: glob("*.png") → 找到 3 个文件
  Step 2: file("view", report.md) → 读取成功
  Step 3: (无)

验证失败原因:
  - 声称"已发送图片"但未调用 send-file 工具
  - 声称"报告已完成"但未进行任何修改操作

请根据以上反馈，实际完成这些操作后再次回复。
如果确实无法完成某项操作，请明确说明原因。
```

## 复杂度自评

在 intelligent.md 中引导 Agent 在回复末尾附加标签：

```
- [x-simple] 单一操作，如回答问题、查看文件（不需要验证）
- [x-complex] 多步骤操作或涉及文件修改/命令执行（需要验证）
```

解析逻辑：正则提取 `/\[x-(simple|complex)\]/`，未标注时默认走简单路径。

## 设计决策

| 决策点 | 结论 |
|--------|------|
| 适用范围 | 复杂任务（Agent 自评） |
| 复杂度判断 | 输出末尾正则提取 `[x-simple]` / `[x-complex]` |
| 验证层 1 | 规则引擎，声明关键词 vs steps 工具调用记录 |
| 验证层 2 | Haiku 语义验证，检测虚假拒绝 + 能力低估 |
| 反馈方式 | 完整上下文注入（任务 + 工具记录 + 失败原因） |
| 重试上限 | 3 轮 |
| 超限处理 | 返回明确失败 |
| Discriminator 形态 | ExecutionCapability 内部方法 |

## 改动范围

```
packages/core/src/agents/
├── capabilities/
│   └── ExecutionCapability.ts    ← 核心：加验证循环 + 保留 steps
├── prompts/templates/
│   └── intelligent.md            ← 加复杂度自评指令
└── types/
    ├── capabilities.ts           ← DispatchResult 新增字段
    └── pipeline.ts               ← 验证结果类型
```

### 不需要改动

- LLMRuntime.ts — 不需要改
- AgentRunner — 子 Agent 执行逻辑不变
- ToolRegistry — 不需要改
- Hook 系统 — 不需要改
- 子 Agent prompts — 不需要改
