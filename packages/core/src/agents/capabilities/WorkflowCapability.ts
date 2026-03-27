/**
 * 工作流能力
 *
 * 提供智能工作流执行
 */

import type {
  AgentCapability,
  AgentContext,
  WorkflowOptions,
  WorkflowResult,
  TaskAnalysis,
} from '../core/types.js';
import { TimeoutError } from '../core/types.js';
import type {
  WorkflowPhaseHookContext,
  TaskProgressHookContext,
  NotificationPushHookContext,
  NotificationType,
} from '../../hooks/types.js';
import { getPromptTemplate } from '../prompts/index.js';
import type { SessionCapability } from './SessionCapability.js';

/**
 * 工作流能力实现
 */
export class WorkflowCapability implements AgentCapability {
  readonly name = 'workflow';
  private context!: AgentContext;
  private workflowCounter: number = 0;

  initialize(context: AgentContext): void {
    this.context = context;
  }

  /**
   * 获取 SessionCapability（可能未注册，如 CLI 模式）
   */
  private getSessionCap(): SessionCapability | null {
    return this.context.getSessionCap?.() ?? null;
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
    // 极简判断：只区分纯问答任务
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

    // 所有其他任务：让 LLM 自己决定
    return {
      type: 'moderate',
      needsExploration: false,
      needsPlanning: false,
      recommendedAgents: ['general'],
      reason: 'Let LLM decide the approach',
    };
  }

  /**
   * 执行智能工作流
   */
  async run(task: string, options?: WorkflowOptions): Promise<WorkflowResult> {
    const sessionId = this.context.hookRegistry.getSessionId();
    let previousPhase: string | undefined;

    // 生成工作流 ID
    this.workflowCounter++;
    const workflowId = `workflow-${this.workflowCounter}`;

    const result: WorkflowResult = {
      analysis: {
        type: 'simple',
        needsExploration: false,
        needsPlanning: false,
        recommendedAgents: [],
        reason: '',
      },
      success: true,
    };

    // 辅助函数：触发阶段变化 hook
    const emitPhaseChange = async (phase: string, message: string) => {
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

    try {
      // 启动心跳检测和执行超时
      const timeoutConfig = this.context.timeoutCap.getConfig();
      const abortController = new AbortController();
      this.context.timeoutCap.startHeartbeat(
        {
          interval: timeoutConfig.heartbeatInterval,
          stallTimeout: timeoutConfig.stallTimeout,
        },
        abortController
      );

      try {
      // 触发开始通知
      await this.emitNotification(
        sessionId,
        'info',
        '工作流开始',
        `开始执行任务: ${task.slice(0, 50)}${task.length > 50 ? '...' : ''}`
      );

      // Phase 1: 简单分析
      await emitPhaseChange('analyze', '准备执行任务...');
      await this.emitProgress(sessionId, workflowId, '分析任务中', 10, '分析', 3);

      result.analysis = this.analyzeTask(task);

      // Phase 2: 直接执行
      await emitPhaseChange('execute', '执行任务...');
      await this.emitProgress(sessionId, workflowId, '执行任务中', 30, '执行', 3);

      // 如果有 chatId，通过 SessionCapability 加载持久化历史
      const chatId = options?.chatId;
      let intelligentPrompt: string;

      if (chatId) {
        const sessionCap = this.getSessionCap();
        if (sessionCap) {
          // 尝试加载已有会话，不存在则创建
          let session = await sessionCap.loadSession(chatId);
          if (!session) {
            session = await sessionCap.createSession({ id: chatId });
          }
          const historyText = sessionCap.getFormattedHistory();
          intelligentPrompt = historyText
            ? this.buildIntelligentPrompt(`${historyText}\n\n用户: ${task}`)
            : this.buildIntelligentPrompt(task);
        } else {
          intelligentPrompt = this.buildIntelligentPrompt(task);
        }
      } else {
        intelligentPrompt = this.buildIntelligentPrompt(task);
      }

      result.executeResult = await this.context.runner.execute('general', intelligentPrompt, {
        cwd: options?.cwd,
        onText: options?.onText,
        onTool: options?.onTool
          ? (name, input) => options.onTool!(name, input)
          : undefined,
        maxTurns: 20,
      });

      result.success = result.executeResult.success;

      // 持久化本轮对话到 SQLite
      if (chatId && result.executeResult) {
        const sessionCap = this.getSessionCap();
        if (sessionCap) {
          await sessionCap.addUserMessage(task);
          if (result.executeResult.text) {
            await sessionCap.addAssistantMessage(result.executeResult.text);
          }
        }
      }

      // Phase 3: 完成
      await emitPhaseChange('complete', result.success ? '任务完成' : '任务失败');
      await this.emitProgress(sessionId, workflowId, '工作流完成', 100, '完成', 3);

      // 触发完成通知
      await this.emitNotification(
        sessionId,
        result.success ? 'success' : 'error',
        result.success ? '任务完成' : '任务失败',
        result.success
          ? '工作流执行成功完成'
          : `工作流执行失败: ${result.error || '未知错误'}`,
        { workflowId, analysis: result.analysis }
      );
      } finally {
        this.context.timeoutCap.stopHeartbeat();
      }
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : String(error);

      // 触发错误阶段
      await emitPhaseChange('error', result.error);
      await this.emitProgress(sessionId, workflowId, '工作流出错', 100, '错误', 3);

      // 触发错误通知
      await this.emitNotification(
        sessionId,
        'error',
        '工作流错误',
        result.error,
        { workflowId, error: true }
      );
    }

    return result;
  }

  /**
   * 预览工作流
   */
  async preview(task: string, _options?: WorkflowOptions): Promise<{
    analysis: TaskAnalysis;
    intelligentPrompt: string;
  }> {
    const analysis = this.analyzeTask(task);
    const intelligentPrompt = this.buildIntelligentPrompt(task);

    return { analysis, intelligentPrompt };
  }

  /**
   * 构建智能 Prompt
   */
  private buildIntelligentPrompt(task: string): string {
    // 检测任务语言
    const isChineseTask = /[\u4e00-\u9fa5]/.test(task);
    const languageInstruction = isChineseTask
      ? '【重要】你必须用中文回复，与用户的语言保持一致。'
      : "CRITICAL: You must respond in English, matching the user's language.";

    // 尝试匹配技能
    const skillMatch = this.context.matchSkill(task);
    let skillSection = '';

    if (skillMatch) {
      skillSection = `\n\n${this.context.skillRegistry.generateSkillInstruction(skillMatch.skill)}`;
    } else if (this.context.skillRegistry.size > 0) {
      skillSection = `\n\n${this.context.skillRegistry.generateSkillListDescription()}`;
    }

    // 使用模板系统
    const template = getPromptTemplate();

    return template.render('intelligent', {
      languageInstruction,
      skillSection,
      task,
    });
  }
}
