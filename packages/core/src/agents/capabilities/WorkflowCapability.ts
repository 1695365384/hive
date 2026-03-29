/**
 * 工作流能力
 *
 * 单 Agent 自主循环执行：收集上下文 → 执行操作 → 验证结果。
 * Agent 自主决定是否使用工具，阶段可交织、可回退。
 *
 * 取代原先的 explore → plan → execute 刚性三阶段管道。
 */

import type {
  AgentCapability,
  AgentContext,
  WorkflowOptions,
  WorkflowResult,
  TaskAnalysis,
} from '../core/types.js';
import type {
  ToolBeforeHookContext,
  ToolAfterHookContext,
  WorkflowPhaseHookContext,
  TaskProgressHookContext,
  NotificationPushHookContext,
  NotificationType,
} from '../../hooks/types.js';
import type { SessionCapability } from './SessionCapability.js';
import { LLMRuntime } from '../runtime/LLMRuntime.js';
import { PromptTemplate } from '../prompts/PromptTemplate.js';

/**
 * 工作流能力实现
 */
export class WorkflowCapability implements AgentCapability {
  readonly name = 'workflow';
  private context!: AgentContext;
  private runtime!: LLMRuntime;
  private promptTemplate!: PromptTemplate;
  private workflowCounter: number = 0;

  initialize(context: AgentContext): void {
    this.context = context;
    this.runtime = new LLMRuntime(context.providerManager);
    this.promptTemplate = new PromptTemplate();
  }

  /**
   * 获取 SessionCapability（可能未注册，如 CLI 模式）
   */
  private getSessionCap(): SessionCapability | null {
    return this.context.getSessionCap?.() ?? null;
  }

  /**
   * 触发推送通知 Hook
   */
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

  /**
   * 触发阶段变化 Hook
   */
  private async emitPhase(
    sessionId: string,
    phase: string,
    message: string,
    previousPhase: string | undefined,
    options: WorkflowOptions | undefined,
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

  /**
   * 触发工具调用前 Hook
   */
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

  /**
   * 触发工具结果 Hook
   */
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

  /**
   * 分析任务复杂度
   */
  analyzeTask(task: string): TaskAnalysis {
    const isPureQuestion =
      task.length < 100 && task.trim().endsWith('?') && !task.includes('\n');

    if (isPureQuestion) {
      return {
        type: 'simple',
        needsExploration: false,
        needsPlanning: false,
        recommendedAgents: ['general'],
        reason: 'Simple question, direct response',
      };
    }

    const ACTION_VERB_RE = /修复|实现|重构|添加|创建|删除|优化|排查|调试|fix|implement|refactor|create|delete|debug/i;
    const isShortMessage = task.length < 30 && !task.includes('\n');

    if (isShortMessage && !ACTION_VERB_RE.test(task)) {
      return {
        type: 'simple',
        needsExploration: false,
        needsPlanning: false,
        recommendedAgents: ['general'],
        reason: 'Short message, no action verbs detected',
      };
    }

    return {
      type: 'moderate',
      needsExploration: true,
      needsPlanning: true,
      recommendedAgents: ['general'],
      reason: 'Task requires exploration and execution',
    };
  }

  /**
   * 执行任务
   *
   * 单 Agent 自主循环：Agent 自主决定收集上下文、执行操作、验证结果。
   */
  async run(task: string, options?: WorkflowOptions): Promise<WorkflowResult> {
    const startTime = Date.now();
    const sessionId = this.context.hookRegistry.getSessionId();
    this.workflowCounter++;
    const workflowId = `workflow-${this.workflowCounter}`;

    let previousPhase: string | undefined;

    try {
      // 启动心跳
      const timeoutConfig = this.context.timeoutCap.getConfig();
      const abortController = new AbortController();
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
        const systemPrompt = this.buildSystemPrompt(task);

        // 获取全部工具
        const tools = this.context.runner.getToolRegistry().getToolsForAgent('general');

        // 从 session 加载历史消息
        const sessionCap = this.getSessionCap();
        const historyMessages = sessionCap?.getMessages() ?? [];

        let result = '';

        const runtimeResult = await this.runtime.run({
          system: systemPrompt,
          messages: historyMessages.length > 0
            ? [...historyMessages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: task }]
            : undefined,
          prompt: historyMessages.length === 0 ? task : undefined,
          tools,
          maxSteps: options?.maxTurns ?? 30,
          streaming: true,
          abortSignal: abortController.signal,
          onText: (text: string) => {
            result += text;
            options?.onText?.(text);
          },
          onToolCall: (toolName: string, input: unknown) => {
            this.emitToolBefore(sessionId, toolName, input);
            options?.onTool?.(toolName, input);
          },
          onToolResult: (toolName: string, output: unknown) => {
            this.emitToolAfter(sessionId, toolName, output);
            // 工具结果更新活动状态（心跳）
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
          { workflowId, duration },
        );

        return {
          text: result,
          tools: runtimeResult.tools,
          success,
          error: runtimeResult.error,
          usage: runtimeResult.usage
            ? { input: runtimeResult.usage.promptTokens, output: runtimeResult.usage.completionTokens }
            : undefined,
          duration,
        };
      } finally {
        this.context.timeoutCap.stopHeartbeat();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.emitPhase(sessionId, 'error', errorMsg, previousPhase, options);
      await this.emitNotification(sessionId, 'error', '执行错误', errorMsg, { workflowId, error: true });

      return {
        text: '',
        tools: [],
        success: false,
        error: errorMsg,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 预览工作流
   */
  async preview(task: string, _options?: WorkflowOptions): Promise<{
    analysis: TaskAnalysis;
    intelligentPrompt: string;
  }> {
    const analysis = this.analyzeTask(task);
    const intelligentPrompt = this.buildSystemPrompt(task);
    return { analysis, intelligentPrompt };
  }

  // ============================================
  // 内部方法
  // ============================================

  /**
   * 构建 system prompt
   */
  private buildSystemPrompt(task: string): string {
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

    return this.promptTemplate.render('intelligent', {
      languageInstruction,
      skillSection: skillSection ?? '',
      task,
    });
  }
}
