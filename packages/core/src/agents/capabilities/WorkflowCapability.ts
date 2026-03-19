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
import type { WorkflowPhaseHookContext } from '../../hooks/types.js';
import { getPromptTemplate } from '../prompts/index.js';

/**
 * 工作流能力实现
 */
export class WorkflowCapability implements AgentCapability {
  readonly name = 'workflow';
  private context!: AgentContext;

  initialize(context: AgentContext): void {
    this.context = context;
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
      // Phase 1: 简单分析
      await emitPhaseChange('analyze', '准备执行任务...');
      result.analysis = this.analyzeTask(task);

      // Phase 2: 直接执行
      await emitPhaseChange('execute', '执行任务...');

      const intelligentPrompt = this.buildIntelligentPrompt(task);

      result.executeResult = await this.context.runner.execute('general', intelligentPrompt, {
        cwd: options?.cwd,
        onText: options?.onText,
        onTool: options?.onTool
          ? (name, input) => options.onTool!(name, input)
          : undefined,
        maxTurns: 20,
      });

      result.success = result.executeResult.success;

      // Phase 3: 完成
      await emitPhaseChange('complete', result.success ? '任务完成' : '任务失败');
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : String(error);

      // 触发错误阶段
      await emitPhaseChange('error', result.error);
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
