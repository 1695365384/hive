/**
 * 子 Agent 能力
 *
 * 提供核心三代理便捷方法
 */

import type { AgentCapability, AgentContext, AgentExecuteOptions, AgentResult, ThoroughnessLevel, AgentType } from '../core/types.js';
import { AGENT_NAMES, CORE_AGENTS } from '../core/agents.js';
import { buildExplorePrompt, buildPlanPrompt } from '../prompts/prompts.js';

/**
 * 子 Agent 能力实现
 */
export class SubAgentCapability implements AgentCapability {
  readonly name = 'subAgent';
  private context!: AgentContext;
  private parentSessionId: string = 'main';

  initialize(context: AgentContext): void {
    this.context = context;
  }

  /**
   * 设置父会话 ID
   */
  setParentSessionId(sessionId: string): void {
    this.parentSessionId = sessionId;
  }

  // ============================================
  // 核心 Agent 方法
  // ============================================

  /**
   * 使用 Explore Agent 探索代码库
   */
  async explore(prompt: string, thoroughness: ThoroughnessLevel = 'medium', options?: AgentExecuteOptions): Promise<string> {
    const result = await this.runWithHooks(
      AGENT_NAMES.EXPLORE,
      buildExplorePrompt(prompt, thoroughness),
      { ...options, tools: options?.tools ?? CORE_AGENTS.explore.tools as string[] }
    );
    return result.text;
  }

  /**
   * 使用 Plan Agent 研究代码库
   */
  async plan(prompt: string, options?: AgentExecuteOptions): Promise<string> {
    const result = await this.runWithHooks(
      AGENT_NAMES.PLAN,
      buildPlanPrompt(prompt),
      { ...options, tools: options?.tools ?? CORE_AGENTS.plan.tools as string[] }
    );
    return result.text;
  }

  /**
   * 使用 General Agent 执行任务
   */
  async general(prompt: string): Promise<string> {
    const result = await this.runWithHooks(AGENT_NAMES.GENERAL, prompt);
    return result.text;
  }

  /**
   * 运行指定子 Agent（带 Hooks）
   */
  async run(name: AgentType, prompt: string, options?: AgentExecuteOptions): Promise<AgentResult> {
    return this.runWithHooks(name, prompt, options);
  }

  /**
   * 内部方法：带 Hook 触发的 Agent 执行
   */
  private async runWithHooks(agentName: string, prompt: string, options?: AgentExecuteOptions): Promise<AgentResult> {
    const startTime = Date.now();

    // 触发 agent:spawn hook
    await this.context.hookRegistry.emit('agent:spawn', {
      parentSessionId: this.parentSessionId,
      agentName,
      prompt,
      timestamp: new Date(),
    });

    try {
      const result = await this.context.runner.execute(agentName as AgentType, prompt, options);
      const duration = Date.now() - startTime;

      // 触发 agent:complete hook
      await this.context.hookRegistry.emit('agent:complete', {
        parentSessionId: this.parentSessionId,
        agentName,
        resultSummary: result.text?.slice(0, 200),
        duration,
        success: result.success,
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      // 触发 agent:complete hook（失败情况）
      await this.context.hookRegistry.emit('agent:complete', {
        parentSessionId: this.parentSessionId,
        agentName,
        duration,
        success: false,
        error: err,
        timestamp: new Date(),
      });

      throw error;
    }
  }
}
