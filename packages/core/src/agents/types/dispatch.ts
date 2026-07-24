/**
 * Agent dispatch types — shared between AgentLoop and ServerImpl.
 *
 * Extracted from CoordinatorCapability.ts during the Coordinator→AgentLoop migration.
 */

import type { TaskProgressEvent } from '../completion/types.js';

/**
 * 统一分发选项
 */
export interface DispatchOptions {
  /** 会话 ID */
  chatId?: string;
  /** 工作目录 */
  cwd?: string;
  /** 最大轮次 */
  maxTurns?: number;
  /** 指定模型 */
  modelId?: string;
  /** 外部系统提示 */
  systemPrompt?: string;
  /** 阶段回调 */
  onPhase?: (phase: string, message: string) => void;
  /**
   * 路由决策回调（TaskRouter resolve 之后立刻触发）
   * 用于交互层展示「直接回答 / 委派 Worker / 能力说明」
   *
   * @deprecated AgentLoop 不再有路由层；保留接口兼容性，但不被调用。
   */
  onRoute?: (route: {
    mode: 'direct' | 'inquiry' | 'delegate' | 'hint';
    scenarioId?: string;
    workerType?: string;
    /** 并行委派时全部 Worker 类型（含主 Worker） */
    workerTypes?: string[];
    title?: string;
  }) => void;
  /**
   * Office PPT 进度（routed / phases / blocked）
   *
   * @deprecated AgentLoop 不再发送 per-slide 进度；保留接口兼容性，但不被调用。
   */
  onOfficeProgress?: (progress: {
    phase: 'routed' | 'creating' | 'adding_slide' | 'validating' | 'delivering' | 'blocked';
    slide?: number;
    slideTotal?: number;
    message?: string;
    workerId?: string;
  }) => void;
  /** 通用任务进度（阶段条 / 续跑 / 阻塞动作） */
  onTaskProgress?: (progress: TaskProgressEvent) => void;
  /**
   * 技能命中回调（当本轮匹配到已安装技能并注入到 system prompt 时触发）
   * 用于交互层展示「已加载技能: X」
   */
  onSkill?: (skill: { name: string; description?: string }) => void;
  /** 文本输出回调 */
  onText?: (text: string) => void;
  /** 工具调用回调 */
  onTool?: (tool: string, input?: unknown) => void;
  /** 工具结果回调 */
  onToolResult?: (tool: string, result: unknown) => void;
  /** 推理回调 */
  onReasoning?: (text: string) => void;
  /** 外部取消信号 */
  abortSignal?: AbortSignal;
}

/**
 * 执行步骤详情（DispatchResult.steps）
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

/**
 * 统一分发结果
 */
export interface DispatchResult {
  /** 最终文本输出（完整） */
  text: string;
  /** 最后一次工具调用后的文本（用于 channel 回复，不含叙述） */
  finalText?: string;
  /** 是否成功 */
  success: boolean;
  /** 总耗时（毫秒） */
  duration: number;
  /** 被调用的工具 */
  tools: string[];
  /** Token 使用量 */
  usage?: { input: number; output: number };
  /** Cost estimation (USD) */
  cost?: { input: number; output: number; total: number };
  /** 错误信息 */
  error?: string;
  /** 执行步骤详情（可选） */
  steps?: StepResult[];
  /** 任务完成判定结果（可选） */
  verification?: import('../completion/types.js').CompletionVerifyResult;
}
