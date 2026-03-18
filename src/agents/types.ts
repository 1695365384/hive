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
