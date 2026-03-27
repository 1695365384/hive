/**
 * Runner / 执行相关类型定义
 *
 * 包含 SDK 消息类型、工作流类型、任务分析等执行层类型
 */

import type { AgentResult } from './core.js';

// ============================================
// SDK 消息类型（用于类型安全的消息处理）
// ============================================

/**
 * 内容块类型
 */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ToolUseContentBlock {
  type: 'tool_use';
  name: string;
  input: unknown;
  id: string;
}

export type ContentBlock = TextContentBlock | ToolUseContentBlock;

/**
 * SDK 消息类型（与 @anthropic-ai/claude-agent-sdk 的类型判别对齐）
 *
 * SDK 使用 `type` 字段做消息类型判别，所有类型守卫必须检查 `type` 字段。
 */

export interface ResultMessage {
  type: 'result';
  subtype: 'success' | 'error_during_execution' | 'error_max_turns' | 'error_max_budget_usd' | 'error_max_structured_output_retries';
  result?: string;
  errors?: string[];
  is_error: boolean;
  num_turns: number;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export interface AssistantMessage {
  type: 'assistant';
  message: {
    content: ContentBlock[];
    role: 'assistant';
  };
}

export interface ToolProgressMessage {
  type: 'tool_progress';
  tool_name: string;
  tool_use_id?: string;
}

export interface UsageMessage {
  type: 'result';
  usage: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export type SdkMessage = ResultMessage | AssistantMessage | ToolProgressMessage | UsageMessage;

/**
 * 类型守卫：检查是否为结果消息
 *
 * SDK 使用 `type: 'result'` 判别，而非检查 `result` 属性是否存在。
 * SDKResultSuccess 有 `result: string`，SDKResultError 只有 `errors: string[]`。
 */
export function isResultMessage(msg: unknown): msg is ResultMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    (msg as { type: string }).type === 'result'
  );
}

/**
 * 类型守卫：检查是否为助手消息
 */
export function isAssistantMessage(msg: unknown): msg is AssistantMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    (msg as { type: string }).type === 'assistant' &&
    'message' in msg
  );
}

/**
 * 类型守卫：检查是否为工具进度消息
 */
export function isToolProgressMessage(msg: unknown): msg is ToolProgressMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    (msg as { type: string }).type === 'tool_progress'
  );
}

/**
 * 类型守卫：检查是否为使用量消息
 *
 * usage 信息嵌在 ResultMessage 中（type: 'result'）。
 */
export function isUsageMessage(msg: unknown): msg is UsageMessage {
  return isResultMessage(msg) && 'usage' in msg;
}

/**
 * 类型守卫：检查是否为文本内容块
 */
export function isTextBlock(block: ContentBlock): block is TextContentBlock {
  return block.type === 'text';
}

/**
 * 类型守卫：检查是否为工具使用内容块
 */
export function isToolUseBlock(block: ContentBlock): block is ToolUseContentBlock {
  return block.type === 'tool_use';
}

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
  /** 探索结果（如果执行了探索） */
  exploreResult?: AgentResult;
  /** 生成的执行计划 */
  executionPlan?: string;
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
