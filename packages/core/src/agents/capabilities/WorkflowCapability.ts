/**
 * 工作流能力
 *
 * 提供智能工作流执行：explore → plan → execute 三子 Agent 顺序执行。
 * 阶段间通过结构化摘要（AgentPhaseResult）传递上下文，
 * 而非原始文本拼接。
 */

import type {
  AgentCapability,
  AgentContext,
  WorkflowOptions,
  WorkflowResult,
  TaskAnalysis,
} from '../core/types.js';
import type {
  WorkflowPhaseHookContext,
  TaskProgressHookContext,
  NotificationPushHookContext,
  NotificationType,
} from '../../hooks/types.js';
import type { AgentPhaseResult } from '../types/pipeline.js';
import type { SessionCapability } from './SessionCapability.js';
import type { SubAgentCapability } from './SubAgentCapability.js';
import { ContextCompactor } from '../pipeline/ContextCompactor.js';
import { DynamicPromptBuilder } from '../pipeline/DynamicPromptBuilder.js';

/**
 * 工作流能力实现
 */
export class WorkflowCapability implements AgentCapability {
  readonly name = 'workflow';
  private context!: AgentContext;
  private workflowCounter: number = 0;
  private compactor!: ContextCompactor;
  private promptBuilder!: DynamicPromptBuilder;

  initialize(context: AgentContext): void {
    this.context = context;
    this.compactor = new ContextCompactor(context.providerManager);
    this.promptBuilder = new DynamicPromptBuilder();
  }

  /**
   * 获取 SessionCapability（可能未注册，如 CLI 模式）
   */
  private getSessionCap(): SessionCapability | null {
    return this.context.getSessionCap?.() ?? null;
  }

  /**
   * 获取 SubAgentCapability
   */
  private getSubAgentCap(): SubAgentCapability | null {
    return this.context.getCapability<SubAgentCapability>('subAgent');
  }

  /**
   * 触发任务进度 Hook
   */
  private async emitProgress(
    sessionId: string,
    taskId: string,
    description: string,
    progress: number,
    currentStep?: string,
    totalSteps?: number
  ): Promise<void> {
    const hookContext: TaskProgressHookContext = {
      sessionId,
      taskId,
      description,
      progress,
      currentStep,
      totalSteps,
      timestamp: new Date(),
    };
    await this.context.hookRegistry.emit('task:progress', hookContext);
  }

  /**
   * 触发推送通知 Hook
   */
  private async emitNotification(
    sessionId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, unknown>
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

    // Short message without action verbs → simple (greetings, casual chat, etc.)
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
      recommendedAgents: ['explore', 'plan', 'general'],
      reason: 'Task requires exploration and execution',
    };
  }

  /**
   * 执行智能工作流
   */
  async run(task: string, options?: WorkflowOptions): Promise<WorkflowResult> {
    const sessionId = this.context.hookRegistry.getSessionId();
    this.workflowCounter++;
    const workflowId = `workflow-${this.workflowCounter}`;

    const emitPhaseChange = this.createPhaseEmitter(sessionId, options);

    try {
      const timeoutConfig = this.context.timeoutCap.getConfig();
      const abortController = new AbortController();
      this.context.timeoutCap.startHeartbeat(
        { interval: timeoutConfig.heartbeatInterval, stallTimeout: timeoutConfig.stallTimeout },
        abortController
      );

      try {
        await this.emitNotification(sessionId, 'info', '工作流开始',
          `开始执行任务: ${task.slice(0, 50)}${task.length > 50 ? '...' : ''}`);

        const analysis = this.analyzeTask(task);
        await emitPhaseChange('analyze', '分析任务...');
        await this.emitProgress(sessionId, workflowId, '分析任务中', 10, '分析', 3);

        const executionResult = analysis.type === 'simple'
          ? await this.runSimpleTask(task, options, emitPhaseChange, sessionId, workflowId)
          : await this.runComplexTask(task, options, emitPhaseChange, sessionId, workflowId);

        const result: WorkflowResult = {
          analysis,
          ...executionResult,
          success: executionResult.executeResult?.success ?? true,
        };

        if (options?.chatId && result.executeResult) {
          await this.persistSession(options.chatId, task, result.executeResult.text);
        }

        await emitPhaseChange('complete', result.success ? '任务完成' : '任务失败');
        await this.emitProgress(sessionId, workflowId, '工作流完成', 100, '完成', 4);

        await this.emitNotification(
          sessionId,
          result.success ? 'success' : 'error',
          result.success ? '任务完成' : '任务失败',
          result.success ? '工作流执行成功完成' : `工作流执行失败: ${result.error || '未知错误'}`,
          { workflowId, analysis }
        );

        return result;
      } finally {
        this.context.timeoutCap.stopHeartbeat();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await emitPhaseChange('error', errorMsg);
      await this.emitProgress(sessionId, workflowId, '工作流出错', 100, '错误', 4);
      await this.emitNotification(sessionId, 'error', '工作流错误', errorMsg, { workflowId, error: true });

      return {
        analysis: this.analyzeTask(task),
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * 执行简单任务（直接执行，无 explore/plan）
   */
  private async runSimpleTask(
    task: string,
    options: WorkflowOptions | undefined,
    emitPhaseChange: (phase: string, message: string) => Promise<void>,
    sessionId: string,
    workflowId: string,
  ): Promise<Pick<WorkflowResult, 'executeResult'>> {
    await emitPhaseChange('execute', '执行任务...');
    await this.emitProgress(sessionId, workflowId, '执行任务中', 30, '执行', 1);

    const executePrompt = this.buildExecutePrompt(task);
    const executeResult = await this.context.runner.execute('general', executePrompt, {
      onText: options?.onText,
      onTool: options?.onTool ? (name, input) => options.onTool!(name, input) : undefined,
    });

    return { executeResult };
  }

  /**
   * 执行复杂任务（explore → plan → execute 三阶段）
   *
   * 使用 ContextCompactor 做阶段间压缩，传递结构化摘要而非原始文本。
   */
  private async runComplexTask(
    task: string,
    options: WorkflowOptions | undefined,
    emitPhaseChange: (phase: string, message: string) => Promise<void>,
    sessionId: string,
    workflowId: string,
  ): Promise<Pick<WorkflowResult, 'exploreResult' | 'explorePhaseResult' | 'executionPlan' | 'planPhaseResult' | 'executeResult'>> {
    const subAgentCap = this.getSubAgentCap();

    if (!subAgentCap) {
      return this.runSimpleTask(task, options, emitPhaseChange, sessionId, workflowId);
    }

    // Phase: Explore
    await emitPhaseChange('explore', '探索代码库...');
    await this.emitProgress(sessionId, workflowId, '探索代码库中', 20, '探索', 4);

    const exploreResult = await this.runExplorePhase(subAgentCap, task, emitPhaseChange);

    // Compress explore output into structured summary
    const explorePhaseResult = await this.compactor.compressPhase(exploreResult, 'explore');

    // Auto-compress session after explore phase
    await this.autoCompress();

    // Phase: Plan
    await emitPhaseChange('plan', '制定执行方案...');
    await this.emitProgress(sessionId, workflowId, '制定执行方案中', 40, '规划', 4);

    const planPhaseResult = await this.runPlanPhase(subAgentCap, task, explorePhaseResult, emitPhaseChange);

    // Auto-compress session after plan phase
    await this.autoCompress();

    // Phase: Execute — use DynamicPromptBuilder with structured prior results
    await emitPhaseChange('execute', '执行任务...');
    await this.emitProgress(sessionId, workflowId, '执行任务中', 60, '执行', 4);

    const executionPlan = planPhaseResult.summary;
    const executePrompt = this.buildExecutePromptWithPhaseResults(
      task,
      [explorePhaseResult, planPhaseResult],
    );

    const executeResult = await this.context.runner.execute('general', executePrompt, {
      onText: options?.onText,
      onTool: options?.onTool ? (name, input) => options.onTool!(name, input) : undefined,
    });

    return {
      exploreResult,
      explorePhaseResult,
      executionPlan,
      planPhaseResult,
      executeResult,
    };
  }

  /**
   * Explore 阶段
   */
  private async runExplorePhase(
    subAgentCap: SubAgentCapability,
    task: string,
    emitPhaseChange: (phase: string, message: string) => Promise<void>,
  ): Promise<import('../core/types.js').AgentResult> {
    try {
      const text = await subAgentCap.explore(task);
      return { text, success: true, tools: [] };
    } catch (error) {
      const text = `探索失败: ${error instanceof Error ? error.message : String(error)}`;
      await emitPhaseChange('explore', `探索阶段失败: ${text.slice(0, 100)}`);
      return { text, success: false, tools: [] };
    }
  }

  /**
   * Plan 阶段
   *
   * 接收结构化的 explore 阶段结果，而非原始文本。
   */
  private async runPlanPhase(
    subAgentCap: SubAgentCapability,
    task: string,
    explorePhaseResult: AgentPhaseResult,
    emitPhaseChange: (phase: string, message: string) => Promise<void>,
  ): Promise<AgentPhaseResult> {
    try {
      // Build plan prompt from structured explore results
      const planContext = this.promptBuilder.formatPriorResults([explorePhaseResult]);
      const planPrompt = `## Task\n${task}\n\n${planContext}\n\nBased on the exploration findings above, create a detailed execution plan.`;

      const text = await subAgentCap.plan(planPrompt);

      // Compress plan output into structured summary
      return await this.compactor.compressPhase(
        { text, success: true, tools: [] },
        'plan',
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await emitPhaseChange('plan', `规划阶段失败: ${errorMsg.slice(0, 100)}`);

      // Return a minimal phase result on failure
      return {
        summary: `规划失败: ${errorMsg}`,
        keyFiles: explorePhaseResult.keyFiles,
        findings: [],
        suggestions: [],
        rawText: '',
        phase: 'plan',
        originalLength: 0,
        compressedLength: errorMsg.length,
      };
    }
  }

  /**
   * 创建阶段事件发射器
   */
  private createPhaseEmitter(
    sessionId: string,
    options: WorkflowOptions | undefined,
  ): (phase: string, message: string) => Promise<void> {
    let previousPhase: string | undefined;
    return async (phase: string, message: string) => {
      const hookContext: WorkflowPhaseHookContext = {
        sessionId,
        phase,
        message,
        previousPhase,
        timestamp: new Date(),
      };
      await this.context.hookRegistry.emit('workflow:phase', hookContext);
      previousPhase = phase;
      options?.onPhase?.(phase, message);
    };
  }

  /**
   * 预览工作流
   */
  async preview(task: string, _options?: WorkflowOptions): Promise<{
    analysis: TaskAnalysis;
    intelligentPrompt: string;
  }> {
    const analysis = this.analyzeTask(task);
    const intelligentPrompt = this.buildExecutePrompt(task);
    return { analysis, intelligentPrompt };
  }

  // ============================================
  // 内部方法
  // ============================================

  /**
   * 构建 execute 阶段的 prompt（简单模式 / 无前置阶段结果）
   */
  private buildExecutePrompt(task: string): string {
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

    return this.promptBuilder.buildPrompt({
      task,
      priorResults: [],
      agentType: 'general',
      languageInstruction,
      skillSection,
    });
  }

  /**
   * 构建 execute 阶段的 prompt（复杂模式 / 带前置阶段结构化结果）
   *
   * 使用 DynamicPromptBuilder 动态构建，替代旧的文本拼接。
   */
  private buildExecutePromptWithPhaseResults(
    task: string,
    priorResults: AgentPhaseResult[],
  ): string {
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

    return this.promptBuilder.buildPrompt({
      task,
      priorResults,
      agentType: 'general',
      languageInstruction,
      skillSection,
    });
  }

  /**
   * 持久化对话到 SessionCapability
   */
  private async persistSession(chatId: string, task: string, responseText?: string): Promise<void> {
    const sessionCap = this.getSessionCap();
    if (!sessionCap) return;

    await sessionCap.addUserMessage(task);
    if (responseText) {
      await sessionCap.addAssistantMessage(responseText);
    }
  }

  /**
   * 自动压缩（在阶段间调用）
   *
   * 当 SessionCapability 不可用时静默跳过。
   */
  private async autoCompress(): Promise<void> {
    try {
      const sessionCap = this.getSessionCap();
      if (!sessionCap) return;
      await sessionCap.compressIfNeeded();
    } catch {
      // compression is best-effort, never block workflow
    }
  }
}
