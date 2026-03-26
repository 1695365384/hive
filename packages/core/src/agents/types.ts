/**
 * Agent 类型定义
 *
 * 定义所有 Agent 相关的类型
 */

import type { AgentDefinition, Options } from '@anthropic-ai/claude-agent-sdk';

/**
 * Agent 类型
 */
export type AgentType = 'explore' | 'plan' | 'general' | 'code-reviewer' | 'test-engineer' | 'doc-writer' | 'debugger' | 'refactorer' | 'security-auditor' | 'custom';

/**
 * Agent 配置
 */
export interface AgentConfig extends Omit<AgentDefinition, 'description'> {
  /** Agent 类型标识 */
  type: AgentType;
  /** 描述 */
  description?: string;
  /** 使用的模型 */
  model?: string;
  /** 最大轮次 */
  maxTurns?: number;
  /** 可用工具 */
  tools?: string[];
}

/**
 * Agent 执行选项
 */
export interface AgentExecuteOptions extends Omit<Options, 'agents'> {
  /** 回调：文本输出 */
  onText?: (text: string) => void;
  /** 回调：工具使用 */
  onTool?: (toolName: string, input?: unknown) => void;
  /** 回调：错误 */
  onError?: (error: Error) => void;
}

/**
 * Agent 执行结果
 */
export interface AgentResult {
  /** 输出文本 */
  text: string;
  /** 使用的工具列表 */
  tools: string[];
  /** Token 使用量 */
  usage?: {
    input: number;
    output: number;
  };
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/**
 * 探索严格程度
 */
export type ThoroughnessLevel = 'quick' | 'medium' | 'very-thorough';

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
 * SDK 消息类型
 */
export interface ResultMessage {
  result: unknown;
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
  usage: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export type SdkMessage = ResultMessage | AssistantMessage | ToolProgressMessage | UsageMessage;

/**
 * 类型守卫：检查是否为结果消息
 */
export function isResultMessage(msg: unknown): msg is ResultMessage {
  return typeof msg === 'object' && msg !== null && 'result' in msg;
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
 */
export function isUsageMessage(msg: unknown): msg is UsageMessage {
  return typeof msg === 'object' && msg !== null && 'usage' in msg;
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
