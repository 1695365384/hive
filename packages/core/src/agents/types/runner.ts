/**
 * Runner / 执行相关类型定义
 *
 * 包含工作流类型、任务分析等执行层类型
 */

import type { AgentResult } from './core.js';
import type { AgentPhaseResult } from './pipeline.js';

// ============================================
// 工作流类型
// ============================================

/**
 * 工作流选项
 */
export interface WorkflowOptions {
  /** 工作目录 */
  cwd?: string;
  /** 最大轮次 */
  maxTurns?: number;
  /** 会话标识（用于上下文连续性，如飞书群 chatId） */
  chatId?: string;
  /** 回调：阶段变化 */
  onPhase?: (phase: string, message: string) => void;
  /** 回调：工具使用 */
  onTool?: (tool: string, input?: unknown) => void;
  /** 回调：文本输出 */
  onText?: (text: string) => void;
}

/**
 * 工作流结果
 */
export interface WorkflowResult {
  /** 任务分析结果 */
  analysis: TaskAnalysis;
  /** 探索阶段的结构化结果（如果执行了探索） */
  exploreResult?: AgentResult;
  /** 探索阶段压缩摘要 */
  explorePhaseResult?: AgentPhaseResult;
  /** 生成的执行计划 */
  executionPlan?: string;
  /** 执行计划的结构化结果 */
  planPhaseResult?: AgentPhaseResult;
  /** 执行结果 */
  executeResult?: AgentResult;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/**
 * 任务分析结果
 */
export interface TaskAnalysis {
  /** 任务类型 */
  type: 'simple' | 'moderate' | 'complex';
  /** 需要探索 */
  needsExploration: boolean;
  /** 需要计划 */
  needsPlanning: boolean;
  /** 推荐的 Agent */
  recommendedAgents: string[];
  /** 理由 */
  reason: string;
}
