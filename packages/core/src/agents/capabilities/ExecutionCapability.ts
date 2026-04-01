/**
 * 统一任务执行能力
 *
 * 合并 ChatCapability + WorkflowCapability + SubAgentCapability 的核心逻辑。
 * 所有执行路径统一：streamText + 动态工具集 + subagent tools。
 * CLI 的强制角色模式通过 forceMode 参数实现。
 */

import type { AgentCapability, AgentContext } from '../core/types.js';
import type {
  ToolBeforeHookContext,
  ToolAfterHookContext,
  WorkflowPhaseHookContext,
  NotificationPushHookContext,
  NotificationType,
} from '../../hooks/types.js';
import type { SessionCapability } from './SessionCapability.js';
import type { Tool } from 'ai';
import { LLMRuntime } from '../runtime/LLMRuntime.js';
import { PromptTemplate } from '../prompts/PromptTemplate.js';
import { createAllSubagentTools } from '../../tools/built-in/subagent-tools.js';
import { createDynamicPromptBuilder } from '../pipeline/DynamicPromptBuilder.js';
import type { PromptBuildContext } from '../types/pipeline.js';
import { buildScheduleSummary } from './schedule-summary.js';
import { getModelPricing } from '../../providers/metadata/pricing.js';

// ============================================
// 类型
// ============================================

/**
 * 强制角色模式
 *
 * undefined = 正常模式（全量工具 + subagent tools）
 * 'explore' / 'plan' = 只读模式（只读工具，无 subagent tools）
 */
export type ForceMode = 'explore' | 'plan' | undefined;

/**
 * 统一分发选项
 */
export interface DispatchOptions {
  /** 会话 ID（用于 session 切换和持久化） */
  chatId?: string;
  /** 工作目录 */
  cwd?: string;
  /** 强制角色模式 */
  forceMode?: ForceMode;
  /** 最大轮次 */
  maxTurns?: number;
  /** 指定模型（仅本次请求） */
  modelId?: string;
  /** 外部系统提示（完全替换自动构建的提示） */
  systemPrompt?: string;
  /** 阶段回调 */
  onPhase?: (phase: string, message: string) => void;
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
 * 统一分发结果
 */
export interface DispatchResult {
  /** 最终文本输出 */
  text: string;
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
}

// ============================================
// Implementation
// ============================================

/**
 * 统一任务执行能力
 */
export class ExecutionCapability implements AgentCapability {
  readonly name = 'execution';
  private context!: AgentContext;
  private runtime!: LLMRuntime;
  private promptTemplate!: PromptTemplate;
  private subagentTools: Record<string, Tool> = {};

  private static readonly DEFAULT_MAX_TURNS = 30;

  initialize(context: AgentContext): void {
    this.context = context;
    this.runtime = new LLMRuntime(context.providerManager);
    this.promptTemplate = new PromptTemplate();
    this.subagentTools = createAllSubagentTools(context);
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * 执行任务
   */
  async run(task: string, options?: DispatchOptions): Promise<DispatchResult> {
    const startTime = Date.now();
    const sessionId = this.context.hookRegistry.getSessionId();

    // 空任务快速返回
    if (!task?.trim()) {
      return {
        text: '',
        success: false,
        duration: Date.now() - startTime,
        error: 'Task is empty',
        tools: [],
      };
    }

    let previousPhase: string | undefined;
    const abortController = new AbortController();

    try {
      // 确保 session 已切换到正确的 chatId
      await this.ensureSession(options?.chatId);

      // 启动心跳
      const timeoutConfig = this.context.timeoutCap.getConfig();
      const combinedSignal = this.combineAbortSignals(abortController.signal, options?.abortSignal);

      this.context.timeoutCap.startHeartbeat(
        { interval: timeoutConfig.heartbeatInterval, stallTimeout: timeoutConfig.stallTimeout },
        abortController,
      );

      try {
        await this.emitNotification(sessionId, 'info', '任务开始',
          `开始执行: ${task.slice(0, 50)}${task.length > 50 ? '...' : ''}`);

        previousPhase = 'start';
        await this.emitPhase(sessionId, 'execute', '执行任务...', previousPhase, options);

        // 构建 system prompt
        const systemPrompt = await this.buildSystemPrompt(task, options?.forceMode, options?.systemPrompt);

        // 获取工具集
        const tools = this.selectTools(options?.forceMode);

        // 从 session 加载历史消息
        const historyMessages = this.loadHistoryMessages();

        // NOTE: Intentional mutable accumulator for streaming — onText fires
        // multiple times during a single run; immutable patterns don't apply here.
        let result = '';

        const runtimeResult = await this.runtime.run({
          system: systemPrompt,
          messages: historyMessages.length > 0
            ? [...historyMessages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: task }]
            : undefined,
          prompt: historyMessages.length === 0 ? task : undefined,
          tools,
          maxSteps: options?.maxTurns ?? ExecutionCapability.DEFAULT_MAX_TURNS,
          model: options?.modelId,
          streaming: true,
          abortSignal: combinedSignal,
          onText: (text: string) => {
            result += text;
            options?.onText?.(text);
          },
          onToolCall: (toolName: string, input: unknown) => {
            this.emitToolBefore(sessionId, toolName, input).catch(
              (err) => this.context.hookRegistry.emit('notification:push', {
                sessionId, type: 'warning', title: 'Hook Error',
                message: `tool:before hook failed: ${err instanceof Error ? err.message : String(err)}`,
                timestamp: new Date(),
              }),
            );
            options?.onTool?.(toolName, input);
          },
          onToolResult: (toolName: string, output: unknown) => {
            this.emitToolAfter(sessionId, toolName, output).catch(
              (err) => this.context.hookRegistry.emit('notification:push', {
                sessionId, type: 'warning', title: 'Hook Error',
                message: `tool:after hook failed: ${err instanceof Error ? err.message : String(err)}`,
                timestamp: new Date(),
              }),
            );
            options?.onToolResult?.(toolName, output);
            this.context.timeoutCap.updateActivity();
          },
        });

        const duration = Date.now() - startTime;
        const success = runtimeResult.success;

        previousPhase = 'execute';
        await this.emitPhase(sessionId, 'complete', success ? '任务完成' : '任务失败', previousPhase, options);

        await this.emitNotification(
          sessionId,
          success ? 'success' : 'error',
          success ? '任务完成' : '任务失败',
          success ? '执行成功完成' : `执行失败: ${runtimeResult.error || '未知错误'}`,
          { duration },
        );

        // 持久化对话到 session
        if (success && result) {
          await this.persistSession(task, result);
        }

        const modelId = this.context.getActiveProvider()?.model;

        return {
          text: result,
          tools: runtimeResult.tools,
          success,
          error: runtimeResult.error,
          usage: runtimeResult.usage
            ? { input: runtimeResult.usage.promptTokens, output: runtimeResult.usage.completionTokens }
            : undefined,
          cost: this.calculateCost(
            runtimeResult.usage
              ? { input: runtimeResult.usage.promptTokens, output: runtimeResult.usage.completionTokens }
              : undefined,
            modelId,
          ),
          duration,
        };
      } finally {
        this.context.timeoutCap.stopHeartbeat();
      }
    } catch (error) {
      abortController.abort();
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.emitPhase(sessionId, 'error', errorMsg, previousPhase, options);
      await this.emitNotification(sessionId, 'error', '执行错误', errorMsg, { error: true });

      return {
        text: '',
        tools: [],
        success: false,
        error: errorMsg,
        duration: Date.now() - startTime,
      };
    }
  }

  // ============================================
  // System Prompt Building
  // ============================================

  /**
   * 构建 system prompt
   *
   * - 外部 systemPrompt: 作为基础，后面追加 env/schedule/tools sections
   * - forceMode explore/plan: 使用对应模板，只读工具
   * - 正常模式: intelligent.md + 全量工具 + subagent tools
   */
  private async buildSystemPrompt(
    task: string,
    forceMode?: ForceMode,
    externalSystemPrompt?: string,
  ): Promise<string> {
    // 选择基础模板
    let basePrompt: string;
    if (externalSystemPrompt) {
      basePrompt = externalSystemPrompt;
    } else if (forceMode === 'explore') {
      basePrompt = this.promptTemplate.render('explore', { task });
    } else if (forceMode === 'plan') {
      basePrompt = this.promptTemplate.render('plan', { task });
    } else {
      const isChineseTask = /[\u4e00-\u9fa5]/.test(task);
      const languageInstruction = isChineseTask
        ? '【重要】你必须用中文回复，与用户的语言保持一致。'
        : "CRITICAL: You must respond in English, matching the user's language.";

      const skillMatch = this.context.matchSkill(task);
      let skillSection: string | undefined;

      if (skillMatch) {
        skillSection = this.context.skillRegistry.generateSkillInstruction(skillMatch.skill);
      } else if (this.context.skillRegistry.size > 0) {
        skillSection = this.context.skillRegistry.generateSkillListDescription();
      }

      basePrompt = this.promptTemplate.render('intelligent', {
        languageInstruction,
        skillSection: skillSection ?? '',
        task,
      });
    }

    // 通过 DynamicPromptBuilder 注入 env/schedule/tools
    const agentType = (forceMode === 'explore' || forceMode === 'plan') ? 'explore' : 'general';
    const builder = createDynamicPromptBuilder();
    const scheduleSummary = await buildScheduleSummary(this.context);
    const toolDescriptions = this.context.runner
      .getToolRegistry()
      .getToolDescriptions(agentType);

    const extraSections = builder.buildPrompt({
      task: '',
      priorResults: [],
      agentType,
      environmentContext: this.context.environmentContext,
      scheduleSummary,
      toolDescriptions,
    } satisfies PromptBuildContext);

    if (extraSections.trim()) {
      return basePrompt + '\n\n' + extraSections;
    }

    return basePrompt;
  }

  // ============================================
  // Tool Selection
  // ============================================

  /**
   * 根据 forceMode 选择工具集
   *
   * - undefined (正常): 全量 general 工具 + subagent tools
   * - 'explore' / 'plan': 只读工具，无 subagent tools
   */
  private selectTools(forceMode?: ForceMode): Record<string, Tool> {
    const toolRegistry = this.context.runner.getToolRegistry();

    if (forceMode === 'explore' || forceMode === 'plan') {
      // 只读模式：使用 explore agent 的工具集（file只读, glob, grep, web-search, web-fetch）
      return toolRegistry.getToolsForAgent('explore');
    }

    // 正常模式：全量 general 工具 + subagent tools
    return {
      ...toolRegistry.getToolsForAgent('general'),
      ...this.subagentTools,
    };
  }

  // ============================================
  // Session Management
  // ============================================

  /**
   * 确保正确的 session 已加载
   */
  private async ensureSession(chatId: string | undefined): Promise<void> {
    if (!chatId) return;

    const sessionCap = this.getSessionCap();
    if (!sessionCap) return;

    if (sessionCap.getCurrentSessionId() === chatId) return;

    const loaded = await sessionCap.loadSession(chatId);
    if (!loaded) {
      await sessionCap.createSession({ id: chatId });
    }
  }

  /**
   * 加载历史消息
   */
  private loadHistoryMessages() {
    const sessionCap = this.getSessionCap();
    return sessionCap?.getMessages() ?? [];
  }

  /**
   * 持久化对话到当前 session
   */
  private async persistSession(task: string, responseText: string): Promise<void> {
    const sessionCap = this.getSessionCap();
    if (!sessionCap) return;

    await sessionCap.addUserMessage(task);
    if (responseText) {
      await sessionCap.addAssistantMessage(responseText);
    }
  }

  /**
   * 获取 SessionCapability（可能未注册，如 CLI 模式）
   */
  private getSessionCap(): SessionCapability | null {
    return this.context.getSessionCap?.() ?? null;
  }

  // ============================================
  // Cost Calculation
  // ============================================

  private calculateCost(
    usage: { input: number; output: number } | undefined,
    modelId: string | undefined,
  ): { input: number; output: number; total: number } | undefined {
    if (!usage || !modelId) {
      return undefined;
    }
    const pricing = getModelPricing(modelId);
    if (!pricing) {
      return undefined;
    }
    const inputCost = (usage.input / 1_000_000) * pricing.input;
    const outputCost = (usage.output / 1_000_000) * pricing.output;
    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
    };
  }

  // ============================================
  // Hook Emitters
  // ============================================

  private async emitNotification(
    sessionId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const hookContext: NotificationPushHookContext = {
      sessionId,
      type,
      title,
      message,
      timestamp: new Date(),
      metadata,
    };
    await this.context.hookRegistry.emit('notification:push', hookContext);
  }

  private async emitPhase(
    sessionId: string,
    phase: string,
    message: string,
    previousPhase: string | undefined,
    options: DispatchOptions | undefined,
  ): Promise<void> {
    const hookContext: WorkflowPhaseHookContext = {
      sessionId,
      phase,
      message,
      previousPhase,
      timestamp: new Date(),
    };
    await this.context.hookRegistry.emit('workflow:phase', hookContext);
    options?.onPhase?.(phase, message);
  }

  private async emitToolBefore(
    sessionId: string,
    toolName: string,
    input: unknown,
  ): Promise<void> {
    const hookContext: ToolBeforeHookContext = {
      sessionId,
      toolName,
      input: input as Record<string, unknown> ?? {},
      timestamp: new Date(),
    };
    await this.context.hookRegistry.emit('tool:before', hookContext);
  }

  private async emitToolAfter(
    sessionId: string,
    toolName: string,
    output: unknown,
  ): Promise<void> {
    const hookContext: ToolAfterHookContext = {
      sessionId,
      toolName,
      input: {},
      output,
      success: true,
      duration: 0,
      timestamp: new Date(),
    };
    await this.context.hookRegistry.emit('tool:after', hookContext);
  }

  // ============================================
  // Utilities
  // ============================================

  private combineAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
    const activeSignals = signals.filter((signal): signal is AbortSignal => signal !== undefined);
    if (activeSignals.length === 0) return undefined;
    if (activeSignals.length === 1) return activeSignals[0];

    return AbortSignal.any(activeSignals);
  }
}
