/**
 * Pipeline 类型定义
 *
 * 多阶段 Swarm 编排的类型系统。
 */

import type { TemplateVariant } from '../swarm/types.js';
import type { SwarmResult } from '../swarm/types.js';

// ============================================
// 触发条件
// ============================================

/**
 * 字段比较运算符
 */
export type FieldOperator = 'eq' | 'ne' | 'gt' | 'lt' | 'contains';

/**
 * 字段匹配规则
 */
export interface FieldMatchRule {
  /** 黑板字段路径（支持点号，如 `scan.security.severity`） */
  field: string;
  /** 比较运算符 */
  operator: FieldOperator;
  /** 比较值 */
  value: string | number;
}

/**
 * 触发条件（联合类型）
 */
export type TriggerCondition =
  | { type: 'always' }
  | { type: 'onField'; field: string; operator: FieldOperator; value: string | number }
  | { type: 'onNodeFail'; nodeId: string }
  | { type: 'confirm'; message: string };

// ============================================
// Pipeline 阶段
// ============================================

/**
 * Pipeline 阶段定义
 */
export interface PipelineStage {
  /** 阶段名称（唯一标识） */
  name: string;
  /** Swarm 模板名称 */
  templateName: string;
  /** 模板变体（可选，默认 medium） */
  templateVariant?: TemplateVariant;
  /** 触发条件（默认 always） */
  trigger?: TriggerCondition;
}

// ============================================
// Pipeline 结果
// ============================================

/**
 * 单个阶段的执行结果
 */
export interface StageResult {
  /** 阶段名称 */
  stageName: string;
  /** 使用的模板名 */
  template: string;
  /** 使用的变体 */
  variant: string;
  /** 是否执行（false 表示被跳过） */
  executed: boolean;
  /** 跳过原因 */
  skipReason?: string;
  /** Swarm 执行结果（仅 executed=true 时有值） */
  result?: SwarmResult;
  /** 阶段耗时（毫秒） */
  duration: number;
}

/**
 * Pipeline 执行结果
 */
export interface PipelineResult {
  /** 所有阶段的执行结果 */
  stages: StageResult[];
  /** Pipeline 是否全部成功 */
  success: boolean;
  /** 最终聚合文本（最后一个已执行阶段的文本） */
  text: string;
  /** 总耗时（毫秒） */
  duration: number;
  /** Token 使用量汇总 */
  usage?: { input: number; output: number };
  /** 错误信息 */
  error?: string;
  /** 完整追踪事件 */
  trace: PipelineTraceEvent[];
}

// ============================================
// Pipeline 追踪事件
// ============================================

/**
 * Pipeline 追踪事件类型
 */
export type PipelineTraceEventType =
  | 'pipeline.start'
  | 'stage.start'
  | 'stage.complete'
  | 'stage.skipped'
  | 'pipeline.complete'
  | 'pipeline.error';

/**
 * Pipeline 追踪事件
 */
export interface PipelineTraceEvent {
  /** 时间戳 */
  timestamp: number;
  /** 事件类型 */
  type: PipelineTraceEventType;
  /** Pipeline ID */
  pipelineId: string;
  /** 阶段名称 */
  stageName?: string;
  /** 模板名称 */
  template?: string;
  /** 模板变体 */
  variant?: string;
  /** 耗时（毫秒） */
  duration?: number;
  /** 跳过原因 */
  skipReason?: string;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

// ============================================
// Pipeline 选项
// ============================================

/**
 * Pipeline 执行选项
 */
export interface PipelineOptions {
  /** 工作目录 */
  cwd?: string;
  /** 层级最大并行数 */
  maxConcurrent?: number;
  /** 黑板值裁剪阈值 */
  blackboardMaxLen?: number;
  /** 是否启用 LLM 分类（默认 false） */
  classify?: boolean;
  /** 回调：阶段变化 */
  onPhase?: (phase: string, message: string) => void;
  /** 回调：节点完成 */
  onNodeComplete?: (nodeId: string, result: import('../types.js').AgentResult) => void;
  /** 回调：人工确认 */
  onConfirm?: (message: string) => Promise<boolean>;
  /** 回调：阶段完成 */
  onStageComplete?: (result: StageResult) => void;
}
