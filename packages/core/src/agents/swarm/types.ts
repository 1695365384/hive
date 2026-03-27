/**
 * 蜂群协作类型定义
 */

import type { AgentType, AgentResult } from '../types.js';

// ============================================
// 错误类型
// ============================================

/**
 * DAG 循环依赖错误
 */
export class CyclicDependencyError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Cyclic dependency detected: ${cycle.join(' → ')}`);
    this.name = 'CyclicDependencyError';
  }
}

// ============================================
// 任务分类
// ============================================

/**
 * 任务类型
 */
export type TaskType = 'add-feature' | 'debug' | 'code-review' | 'refactor' | 'general';

/**
 * 复杂度等级
 */
export type Complexity = 'simple' | 'medium' | 'complex';

/**
 * 模板变体
 */
export type TemplateVariant = 'simple' | 'medium' | 'complex';

/**
 * 任务分类结果
 */
export interface TaskClassification {
  /** 任务类型 */
  type: TaskType;
  /** 复杂度等级 */
  complexity: Complexity;
  /** 分类置信度 (0-1) */
  confidence: number;
}

// ============================================
// 蜂群模板
// ============================================

/**
 * 聚合格式
 */
export type AggregateFormat = 'append' | 'section' | 'summary';

/**
 * 聚合配置
 */
export interface SwarmAggregateConfig {
  /** 取哪个节点的结果作为主结果 */
  primary: string;
  /** 合并哪些节点的结果（附加到主结果后面） */
  merge?: string[];
  /** 合并格式（默认 section） */
  mergeFormat?: AggregateFormat;
}

/**
 * DAG 节点定义
 */
export interface SwarmNode {
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

/**
 * 蜂群模板
 */
export interface SwarmTemplate {
  /** 模板名称 */
  name: string;
  /** 模板变体（默认 'medium'） */
  variant?: TemplateVariant;
  /** 触发匹配（正则） */
  match: RegExp;
  /** 模板描述 */
  description: string;
  /** DAG 节点定义 */
  nodes: Record<string, SwarmNode>;
  /** 聚合策略 */
  aggregate: SwarmAggregateConfig;
}

// ============================================
// 执行图
// ============================================

/**
 * 可执行的 DAG 节点（模板渲染后）
 */
export interface ExecutableNode {
  /** 节点 ID */
  id: string;
  /** 渲染后的 prompt */
  prompt: string;
  /** 使用的 Agent 类型 */
  agent: AgentType;
  /** 覆盖模型 */
  model?: string;
  /** 超时 */
  timeout?: number;
  /** 最大轮次 */
  maxTurns?: number;
  /** 依赖的节点 ID */
  depends: string[];
}

/**
 * 执行图
 */
export interface ExecutableGraph {
  /** 蜂群 ID */
  swarmId: string;
  /** 模板名称 */
  templateName: string;
  /** 原始任务 */
  task: string;
  /** 可执行节点 */
  nodes: Record<string, ExecutableNode>;
  /** 拓扑分层（每层可并行） */
  layers: string[][];
  /** 终端节点（无出边的节点） */
  terminalNodes: string[];
  /** 聚合配置 */
  aggregate: SwarmAggregateConfig;
}

// ============================================
// 黑板
// ============================================

/**
 * 黑板配置
 */
export interface BlackboardConfig {
  /** 值裁剪阈值（默认 4000 chars） */
  maxLen?: number;
  /** 裁剪时保留的首尾字符数（默认 500） */
  keepLen?: number;
}

/**
 * 黑板写入条目
 */
export interface BlackboardEntry {
  value: unknown;
  length: number;
  truncated: boolean;
}

// ============================================
// 追踪事件
// ============================================

/**
 * 追踪事件类型
 */
export type TraceEventType =
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
  | 'swarm.error'
  | 'classifier.complete'
  | 'classifier.low-confidence'
  | 'template.variant-fallback';

/**
 * 追踪事件
 */
export interface TraceEvent {
  /** 时间戳 */
  timestamp: number;
  /** 事件类型 */
  type: TraceEventType;
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
  /** Token 使用量 */
  usage?: { input: number; output: number };
  /** 错误信息 */
  error?: string;
  /** 黑板快照（仅在 layer.complete 时） */
  blackboardSnapshot?: Record<string, BlackboardEntry>;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

// ============================================
// Swarm 选项与结果
// ============================================

/**
 * Swarm 执行选项
 */
export interface SwarmOptions {
  /** 强制使用指定模板（跳过自动匹配） */
  template?: string;
  /** 工作目录 */
  cwd?: string;
  /** 层级最大并行数（默认 5） */
  maxConcurrent?: number;
  /** 黑板值裁剪阈值（默认 4000 chars） */
  blackboardMaxLen?: number;
  /** 是否启用 LLM 分类（默认 true） */
  classify?: boolean;
  /** 回调：文本流式输出 */
  onText?: (nodeId: string, text: string) => void;
  /** 回调：阶段变化 */
  onPhase?: (phase: string, message: string) => void;
  /** 回调：节点完成 */
  onNodeComplete?: (nodeId: string, result: AgentResult) => void;
}

/**
 * 节点执行结果（含元数据）
 */
export interface NodeResult extends AgentResult {
  /** 节点 ID */
  nodeId: string;
  /** 执行时间（毫秒） */
  duration: number;
  /** 是否被跳过 */
  skipped?: boolean;
  /** 跳过原因 */
  skipReason?: string;
}

/**
 * Swarm 执行结果
 */
export interface SwarmResult {
  /** 最终聚合文本 */
  text: string;
  /** 是否成功 */
  success: boolean;
  /** 匹配的模板名 */
  template: string;
  /** 每个节点的执行结果 */
  nodeResults: Record<string, NodeResult>;
  /** 执行追踪 */
  trace: TraceEvent[];
  /** 总耗时（毫秒） */
  duration: number;
  /** Token 使用量汇总 */
  usage?: { input: number; output: number };
  /** 错误信息 */
  error?: string;
}

/**
 * 预览结果（不执行）
 */
export interface SwarmPreview {
  /** 匹配的模板名 */
  template: string;
  /** 模板描述 */
  description: string;
  /** DAG 层级结构 */
  layers: string[][];
  /** 使用的 Agent 列表 */
  agents: string[];
}
