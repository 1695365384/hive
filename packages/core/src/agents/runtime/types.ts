/**
 * LLM Runtime 类型定义
 *
 * 统一的 LLM 执行引擎类型，不依赖任何特定 SDK。
 * 基于 Vercel AI SDK 的事件模型设计。
 */

import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { Tool } from 'ai';

// ============================================
// 步骤结果
// ============================================

/**
 * 单步执行结果
 */
export interface StepResult {
  /** 步骤中使用的工具调用 */
  toolCalls: Array<{
    toolName: string;
    input: unknown;
  }>;
  /** 步骤中的工具结果 */
  toolResults: Array<{
    toolName: string;
    result: unknown;
    isError?: boolean;
  }>;
  /** 是否使用了工具 */
  isToolStep: boolean;
  /** 步骤的文本输出 */
  text?: string;
  /** 步骤的 finish reason */
  finishReason: string | null;
}

// ============================================
// 运行配置
// ============================================

/**
 * LLM Runtime 运行配置
 *
 * 纯配置接口，不含回调。流式事件通过 stream() 的 yield 返回。
 */
export interface RuntimeConfig {
  // ── 模型 ──
  /** 模型 ID（不提供则使用 Provider 默认） */
  model?: string;
  /** Provider ID（不提供则使用活跃 Provider） */
  providerId?: string;
  /** 直接提供 LanguageModelV3 实例（最高优先级） */
  languageModel?: LanguageModelV3;

  // ── 内容 ──
  /** 用户提示（当 messages 有值时可为空） */
  prompt?: string;
  /** 系统提示 */
  system?: string;
  /** 多轮对话历史（chat 场景使用） */
  messages?: Array<Record<string, unknown>>;

  // ── 工具 ──
  /** 可用工具（AI SDK 标准格式） */
  tools?: Record<string, Tool>;
  /** 最大执行步数（含工具调用，默认 10） */
  maxSteps?: number;

  // ── 执行控制 ──
  /** 取消信号 */
  abortSignal?: AbortSignal;
}

// ============================================
// 运行结果
// ============================================

/**
 * LLM Runtime 运行结果
 */
export interface RuntimeResult {
  /** 最终输出文本 */
  text: string;
  /** 所有被调用的工具名称（去重） */
  tools: string[];
  /** Token 使用量 */
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  /** 所有步骤的详细信息 */
  steps: StepResult[];
  /** 是否成功完成 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** 执行耗时（毫秒） */
  duration: number;
  /** 模型规格信息 */
  modelSpec?: {
    contextWindow: number;
    maxOutputTokens: number;
    supportsTools: boolean;
  };
}

// ============================================
// 流式事件（async generator 模式）
// ============================================

/**
 * 流式事件联合类型
 *
 * LLMRuntime.stream() yield 的事件类型。
 * - text-delta / reasoning / tool-call / tool-result / step-finish: 中间事件
 */
export type StreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolName: string; input: unknown }
  | { type: 'tool-result'; toolName: string; output: unknown }
  | { type: 'reasoning'; text: string }
  | { type: 'step-finish'; step: StepResult };

/**
 * stream() 方法返回值
 *
 * 包含事件生成器和结果 Promise。
 * 消费方用 for await 迭代 events，await result 获取最终结果。
 */
export interface StreamHandle {
  /** 事件生成器，yield 中间事件 */
  events: AsyncGenerator<StreamEvent>;
  /** 结果 Promise，在所有事件 yield 完成后 resolve 为 RuntimeResult */
  result: Promise<RuntimeResult>;
}

// ============================================
// Agent Preset
// ============================================

/**
 * Agent 预设配置
 *
 * 定义 explore / plan / general 等内置 Agent 的默认参数
 */
export interface AgentPreset {
  /** 系统提示（可选，调用方通常通过 systemPrompt 传入） */
  system?: string;
  /** 默认工具（AI SDK 标准格式） */
  tools?: Record<string, Tool>;
  /** 默认最大步数 */
  maxSteps: number;
  /** 默认模型（可选，不提供则使用 Provider 默认） */
  model?: string;
}
