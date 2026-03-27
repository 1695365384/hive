## Context

Hive 现有多 Agent 架构：

```
Agent (主入口)
├── AgentRunner         → execute(name, prompt) 单次调用
│                        → runParallel(tasks) 基础并行
├── SubAgentCapability  → explore/plan/general 便捷方法
├── WorkflowCapability  → 固定三阶段（analyze→execute→complete）
├── HookRegistry        → agent:spawn / agent:complete 事件
└── AgentContext (DI)    → runner, hookRegistry, skillRegistry
```

**关键接口（必须对齐）：**

```typescript
// 现有 AgentCapability 接口
interface AgentCapability {
  readonly name: string;
  initialize(context: AgentContext): void;
  initializeAsync?(context: AgentContext): Promise<void>;
  dispose?(): void;
}

// 现有 AgentResult
interface AgentResult {
  text: string;
  tools: string[];
  usage?: { input: number; output: number };
  success: boolean;
  error?: string;
}

// 现有 AgentExecuteOptions
interface AgentExecuteOptions {
  onText?: (text: string) => void;
  onTool?: (toolName: string, input?: unknown) => void;
  onError?: (error: Error) => void;
}

// AgentContext 暴露的核心资源
context.runner          → AgentRunner
context.hookRegistry    → HookRegistry
context.skillRegistry   → SkillRegistry
context.timeoutCap      → TimeoutCapability
```

## Goals / Non-Goals

**Goals:**
1. 基于现有 AgentRunner 实现 DAG 分层并行执行
2. 提供结构化黑板，Agent 间通过读写黑板传递中间产物
3. 模板驱动的任务分解，确定性匹配，不依赖 LLM 做编排决策
4. 全链路执行追踪，每步可审计
5. 作为 SwarmCapability 注册到现有 CapabilityRegistry，零侵入

**Non-Goals:**
- 不用 LLM 做动态任务分解
- 不做跨进程/分布式执行
- 不做持久化黑板
- 不做 Agent 间直接通信

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       SwarmCapability                            │
│                     (implements AgentCapability)                 │
│                                                                  │
│  run(task, options?) ──────────────────────────────────────────┐ │
│       │                                                        │ │
│       ▼                                                        │ │
│  ┌──────────┐    ┌────────────┐    ┌──────────────────────┐    │ │
│  │Decomposer│───▶│  TaskGraph  │───▶│ SwarmExecutor        │    │ │
│  │模板匹配   │    │   DAG 构建   │    │ 拓扑排序 + 分层并行   │    │ │
│  └──────────┘    └────────────┘    └──────────┬───────────┘    │ │
│                                                 │               │ │
│                                    ┌────────────┼────────────┐ │ │
│                                    │            │            │ │ │
│                                    ▼            ▼            ▼ │ │
│                              ┌──────────┐ ┌──────────┐ ┌────┐│ │
│                              │Blackboard│ │  Tracer  │ │Hook││ │
│                              │ 共享黑板  │ │ 执行追踪  │ │Reg││ │
│                              └──────────┘ └──────────┘ └────┘│ │
│                                    │                         │ │
│                                    ▼                         │ │
│                              ┌──────────────┐                │ │
│                              │  Aggregator   │                │ │
│                              │  结果聚合     │                │ │
│                              └──────────────┘                │ │
└──────────────────────────────────────────────────────────────────┘
```

## Decisions

### D1: 蜂群模板格式

**选择：声明式 DAG 配置**

```typescript
interface SwarmTemplate {
  /** 模板名称 */
  name: string;
  /** 触发匹配（正则） */
  match: RegExp;
  /** 模板描述 */
  description: string;
  /** DAG 节点定义 */
  nodes: Record<string, SwarmNode>;
  /** 聚合策略 */
  aggregate: SwarmAggregateConfig;
}

interface SwarmNode {
  /** 使用的 Agent 类型 */
  agent: AgentType;
  /** Prompt 模板（支持 {task}, {nodeId.result} 变量） */
  prompt: string;
  /** 依赖的节点 ID（决定 DAG 边） */
  depends: string[];
  /** 覆盖模型（可选，默认用 agent config 的 model） */
  model?: string;
  /** 节点级超时（毫秒，可选） */
  timeout?: number;
  /** 最大轮次（可选） */
  maxTurns?: number;
}

interface SwarmAggregateConfig {
  /** 取哪个节点的结果作为主结果 */
  primary: string;
  /** 合并哪些节点的结果（附加到主结果后面） */
  merge?: string[];
  /** 合并格式 */
  mergeFormat?: 'append' | 'section' | 'summary';
}
```

**决定：**
- prompt 模板用简单的 `{variable}` 语法，不用模板引擎（零依赖）
- 变量来源：`{task}`（用户原始任务）、`{nodeId}`（节点 ID）、`{nodeId.result}`（节点结果文本）
- `depends` 空数组 = 入口节点（Layer 0），无出边 = 终端节点

### D2: DAG 执行策略

**选择：拓扑排序 + 分层并行**

```typescript
// 伪代码
async function executeGraph(graph, blackboard, tracer, runner) {
  const layers = topologicalSort(graph.nodes, graph.edges);

  for (const layer of layers) {
    tracer.record('layer.start', { layerIndex, nodeIds: layer });

    // 同层全部并行
    const results = await Promise.allSettled(
      layer.map(nodeId => executeNode(nodeId, graph, blackboard, runner, tracer))
    );

    // 处理失败：标记下游为 skipped
    for (const [i, result] of results.entries()) {
      if (result.status === 'rejected') {
        blackboard.set(layer[i], { skipped: true, error: result.reason });
        tracer.record('node.error', { nodeId: layer[i], error: result.reason });
      }
    }
  }
}
```

**拓扑排序算法：**
1. 计算每个节点的入度
2. 入度为 0 的节点 = Layer 0
3. 移除 Layer 0 节点，重新计算入度 → Layer 1
4. 重复直到所有节点分配完毕
5. 如果有环 → 抛出 `CyclicDependencyError`

**失败处理：**
- 单节点失败 → 该节点结果标记为 `{ skipped: true, error }`
- 依赖失败节点的下游 → 检查黑板，发现依赖 skipped → 跳过执行
- 全部终端节点失败 → 返回已完成的中间结果 + 错误信息
- 至少一个终端节点成功 → 正常聚合

### D3: 黑板设计

**选择：带事件通知的类型安全 Map**

```typescript
class Blackboard {
  private data = new Map<string, unknown>();
  private onChange = new Map<string, Set<(value: unknown) => void>>();
  private globalListeners = new Set<(key: string, value: unknown) => void>();

  // 写入（触发通知）
  set(key: string, value: unknown): void;

  // 读取
  get<T>(key: string): T | undefined;

  // 渲染 prompt 模板变量
  // "根据 {explore.result} 和 {plan.result} 实现 {task}"
  // → "根据 [842chars探索结果] 和 [1203chars规划结果] 实现 添加用户认证"
  render(template: string): string;

  // 裁剪长值（防止 token 膨胀）
  // 超过 maxLen 的值取首 500 + 尾 500 + "...(truncated N chars)"
  private truncate(value: string, maxLen: number): string;

  // 快照（用于追踪和调试）
  snapshot(): Record<string, { length: number; truncated: boolean }>;

  // 监听变化
  on(key: string, listener: (value: unknown) => void): () => void;
  onAny(listener: (key: string, value: unknown) => void): () => void;
}
```

**关键设计点：**
- **生命周期**：每次 `swarm.run()` 创建新黑板实例，执行结束销毁
- **值裁剪**：默认阈值 4000 chars，超过则取首尾各 500 chars + 中间省略标记
- **变量路径**：支持 `nodeId.result` 形式，自动从 `AgentResult.text` 提取
- **不可变写入**：同一 key 写两次抛错（防止意外覆盖）

### D4: 执行追踪器

**选择：事件流 + 结构化报告**

```typescript
interface TraceEvent {
  /** 时间戳 */
  timestamp: number;
  /** 事件类型 */
  type:
    | 'swarm.start'
    | 'template.match'
    | 'graph.build'
    | 'layer.start'
    | 'node.start'
    | 'node.complete'
    | 'node.error'
    | 'node.skipped'
    | 'blackboard.write'
    | 'layer.complete'
    | 'swarm.complete'
    | 'swarm.error';
  /** 蜂群执行 ID */
  swarmId: string;
  /** 层级索引 */
  layerIndex?: number;
  /** 节点信息 */
  nodeId?: string;
  agent?: string;
  model?: string;
  prompt?: string;
  /** 执行结果摘要 */
  resultLength?: number;
  resultTruncated?: boolean;
  tools?: string[];
  duration?: number;
  /** 错误信息 */
  error?: string;
  /** 黑板快照（仅在 layer.complete 时） */
  blackboardSnapshot?: Record<string, unknown>;
}

class SwarmTracer {
  private events: TraceEvent[] = [];

  record(event: TraceEvent): void;
  getEvents(): ReadonlyArray<TraceEvent>;
  getSwarmId(): string;

  // 生成人类可读的树状报告
  report(): string;
  // 导出 JSON
  toJSON(): TraceEvent[];
}
```

**报告格式示例：**
```
═══ Swarm #sw-3 ═══
Task: "帮我加用户认证模块"
Template: add-feature (matched: "添加")
─────────────────────────────────────────
[Layer 0] 2 nodes, 2.1s
  ✅ explore (Haiku, 1.8s) → 842 chars [Glob, Grep, Read]
  ✅ plan (Haiku, 2.1s) → 1203 chars [Read, Grep]

[Layer 1] 1 node, 8.3s
  ✅ implement (Sonnet, 8.3s) → 2401 chars [Write, Edit, Bash]

[Layer 2] 2 nodes, 4.1s
  ✅ review (Haiku, 3.2s) → 678 chars
  ⏭️ test (Skipped: dependency error)

═══ Result: implement (2401 chars) + review (678 chars) ═══
═══ Total: 14.5s | Tokens: in=12400 out=8200 ═══
```

### D5: 结果聚合策略

```typescript
type AggregateFormat =
  | 'append'     // 直接拼接
  | 'section'    // 分节格式（## NodeName \n content）
  | 'summary';   // 仅保留主结果

function aggregate(
  config: SwarmAggregateConfig,
  results: Map<string, AgentResult>,
  blackboard: Blackboard
): SwarmResult {
  const primary = results.get(config.primary);
  if (!primary || !primary.success) {
    // 主节点失败，尝试找其他成功的终端节点
    // ...
  }

  let text = primary.text;

  // 合并附加节点
  if (config.merge) {
    for (const nodeId of config.merge) {
      const result = results.get(nodeId);
      if (result?.success) {
        text += formatMerge(config.mergeFormat!, nodeId, result.text);
      }
    }
  }

  return { text, success: true, nodeResults: Object.fromEntries(results) };
}
```

### D6: SwarmCapability 对外 API

```typescript
interface SwarmOptions {
  /** 强制使用指定模板（跳过自动匹配） */
  template?: string;
  /** 工作目录 */
  cwd?: string;
  /** 层级最大并行数（默认 5） */
  maxConcurrent?: number;
  /** 黑板值裁剪阈值（默认 4000 chars） */
  blackboardMaxLen?: number;
  /** 回调：文本流式输出 */
  onText?: (nodeId: string, text: string) => void;
  /** 回调：阶段变化 */
  onPhase?: (phase: string, message: string) => void;
  /** 回调：节点完成 */
  onNodeComplete?: (nodeId: string, result: AgentResult) => void;
}

interface SwarmResult {
  /** 最终聚合文本 */
  text: string;
  /** 是否成功 */
  success: boolean;
  /** 匹配的模板名 */
  template: string;
  /** 每个节点的执行结果 */
  nodeResults: Record<string, AgentResult>;
  /** 执行追踪 */
  trace: TraceEvent[];
  /** 总耗时 */
  duration: number;
  /** 错误信息 */
  error?: string;
}
```

**SwarmCapability 实现：**

```typescript
class SwarmCapability implements AgentCapability {
  readonly name = 'swarm';
  private context!: AgentContext;
  private templates = new Map<string, SwarmTemplate>();

  initialize(context: AgentContext): void {
    this.context = context;
    // 注册内置模板
    for (const tpl of BUILTIN_TEMPLATES) {
      this.templates.set(tpl.name, tpl);
    }
  }

  async run(task: string, options?: SwarmOptions): Promise<SwarmResult> {
    const tracer = new SwarmTracer();
    const blackboard = new Blackboard({ maxLen: options?.blackboardMaxLen });

    // 1. 匹配模板
    const template = this.matchTemplate(task, options?.template);
    // 2. 构建黑板初始值
    blackboard.set('task', task);
    // 3. 构建 DAG
    const graph = buildGraph(template, blackboard);
    // 4. 执行
    const executor = new SwarmExecutor(this.context.runner, options);
    const results = await executor.execute(graph, blackboard, tracer);
    // 5. 聚合
    const aggregated = aggregate(template.aggregate, results, blackboard);
    // 6. 触发 hook
    await this.context.hookRegistry.emit('swarm:complete', { ... });

    return { ...aggregated, trace: tracer.getEvents(), template: template.name };
  }

  registerTemplate(template: SwarmTemplate): void { ... }
  getTrace(swarmId: string): TraceEvent[] { ... }
}
```

### D7: 内置模板详细设计

**add-feature（添加功能）**

```
explore ──┐
         ├──▶ implement ──┬──▶ review
plan ────┘                └──▶ test
```

| 节点 | Agent | 模型 | 依赖 | Prompt |
|------|-------|------|------|--------|
| explore | explore | Haiku | - | 搜索项目中与 `{task}` 相关的代码结构、路由、模型定义 |
| plan | plan | Haiku | - | 分析 `{task}` 的实现方案，找出需要修改/新增的文件 |
| implement | general | Sonnet | explore, plan | 根据以下探索和规划结果实现 `{task}`\n\n探索发现:\n{explore.result}\n\n规划方案:\n{plan.result} |
| review | code-reviewer | Haiku | implement | 审查以下代码变更:\n{implement.result} |
| test | test-engineer | Haiku | implement | 为 `{task}` 生成测试用例:\n{implement.result} |

聚合：`primary: implement, merge: [review, test], format: section`

**debug（修复 bug）**

```
explore ──▶ analyze ──▶ fix ──▶ verify
```

| 节点 | Agent | 模型 | 依赖 | Prompt |
|------|-------|------|------|--------|
| explore | explore | Haiku | - | 定位 `{task}` 相关的代码文件 |
| analyze | plan | Haiku | explore | 分析以下代码中可能的 bug 原因:\n{explore.result}\n\n问题描述: {task} |
| fix | general | Sonnet | analyze | 修复以下 bug:\n{task}\n\n分析结果:\n{analyze.result} |
| verify | test-engineer | Haiku | fix | 验证以下修复:\n{fix.result} |

聚合：`primary: fix, merge: [verify]`

**code-review（代码审查）**

```
security  ──┐
           ├──▶ aggregate
quality   ──┤
           │
test      ──┘
```

| 节点 | Agent | 模型 | 依赖 | Prompt |
|------|-------|------|------|--------|
| security | security-auditor | Haiku | - | 安全审查: {task} |
| quality | code-reviewer | Haiku | - | 代码质量审查: {task} |
| test | test-engineer | Haiku | - | 测试覆盖审查: {task} |

聚合：`primary: quality, merge: [security, test], format: section`

**refactor（重构）**

```
explore ──▶ refactor ──▶ test
```

聚合：`primary: refactor, merge: [test]`

### D8: Hook 集成

复用现有 HookRegistry，新增两个事件类型：

```typescript
// swarm:phase — 蜂群阶段变化（复用 WorkflowPhaseHookContext 结构）
interface SwarmPhaseHookContext {
  sessionId: string;
  phase: 'template-match' | 'execute' | 'aggregate' | 'complete' | 'error';
  message: string;
  swarmId: string;
  template?: string;
  timestamp: Date;
}

// swarm:node-complete — 单个节点执行完成
interface SwarmNodeHookContext {
  sessionId: string;
  swarmId: string;
  nodeId: string;
  agent: string;
  success: boolean;
  duration: number;
  resultLength: number;
  timestamp: Date;
}
```

**注意：** 不修改现有 hooks/types.ts，Swarm 内部自行构造 context 对象调用 `hookRegistry.emit()`。如果未来需要类型安全，再添加到 hooks 类型中。

### D9: 降级策略

当模板匹配失败时，降级为现有 WorkflowCapability：

```typescript
async run(task: string, options?: SwarmOptions): Promise<SwarmResult> {
  const template = this.matchTemplate(task, options?.template);

  if (!template) {
    // 降级：走现有 workflow
    const workflowCap = this.context.capabilityRegistry.get('workflow');
    const result = await workflowCap.run(task, {
      cwd: options?.cwd,
      onText: options?.onText ? (t) => options.onText!('workflow', t) : undefined,
    });

    return {
      text: result.executeResult?.text ?? '',
      success: result.success,
      template: '_fallback_workflow',
      nodeResults: {},
      trace: [],
      duration: 0,
    };
  }

  // 正常蜂群执行...
}
```

## Risks / Trade-offs

| 决策 | 风险 | 缓解 |
|------|------|------|
| 正则匹配模板 | 非标准表述匹配不上 | 降级 workflow；用户自定义模板 |
| 黑板值裁剪 | 可能丢失关键信息 | 默认 4000 chars 足够；用户可调 |
| 全层等待 | 慢节点拖住整层 | 节点级超时（默认 60s） |
| 内存黑板 | 大结果占内存 | 生命周期短（单次执行）；值裁剪 |
| 不用 LLM 编排 | 无法处理完全新颖的任务 | 降级 workflow 处理 |

## File Structure

```
packages/core/src/agents/
├── capabilities/
│   └── SwarmCapability.ts     # 主入口（~150 行）
└── swarm/
    ├── types.ts                # 所有类型定义（~120 行）
    ├── templates.ts            # 内置蜂群模板（~150 行）
    ├── decomposer.ts           # 模板匹配 + prompt 渲染（~60 行）
    ├── blackboard.ts           # 共享黑板（~100 行）
    ├── executor.ts             # DAG 执行引擎（~150 行）
    ├── tracer.ts               # 执行追踪器（~120 行）
    ├── aggregator.ts           # 结果聚合（~80 行）
    └── index.ts                # 导出（~20 行）
```

**总代码量预估：~950 行**
