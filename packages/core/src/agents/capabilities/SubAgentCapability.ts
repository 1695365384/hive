/**
 * 子 Agent 能力
 *
 * 提供子 Agent 便捷方法
 */

import type { AgentCapability, AgentContext, AgentResult, ThoroughnessLevel, AgentType } from '../core/types.js';
import { AGENT_NAMES, CORE_AGENT_NAMES, EXTENDED_AGENT_NAMES } from '../core/agents.js';
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
  async explore(prompt: string, thoroughness: ThoroughnessLevel = 'medium'): Promise<string> {
    const result = await this.runWithHooks(
      CORE_AGENT_NAMES.EXPLORE,
      buildExplorePrompt(prompt, thoroughness)
    );
    return result.text;
  }

  /**
   * 使用 Plan Agent 研究代码库
   */
  async plan(prompt: string): Promise<string> {
    const result = await this.runWithHooks(
      CORE_AGENT_NAMES.PLAN,
      buildPlanPrompt(prompt)
    );
    return result.text;
  }

  /**
   * 使用 General Agent 执行任务
   */
  async general(prompt: string): Promise<string> {
    const result = await this.runWithHooks(CORE_AGENT_NAMES.GENERAL, prompt);
    return result.text;
  }

  /**
   * 运行指定子 Agent（带 Hooks）
   */
  async run(name: AgentType, prompt: string): Promise<AgentResult> {
    return this.runWithHooks(name, prompt);
  }

  /**
   * 内部方法：带 Hook 触发的 Agent 执行
   */
  private async runWithHooks(agentName: string, prompt: string): Promise<AgentResult> {
    const startTime = Date.now();

    // 触发 agent:spawn hook
    await this.context.hookRegistry.emit('agent:spawn', {
      parentSessionId: this.parentSessionId,
      agentName,
      prompt,
      timestamp: new Date(),
    });

    try {
      const result = await this.context.runner.execute(agentName as AgentType, prompt);
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

  // ============================================
  // 扩展 Agent 方法
  // ============================================

  /**
   * 代码审查
   */
  async reviewCode(target: string): Promise<string> {
    const result = await this.runWithHooks(
      EXTENDED_AGENT_NAMES.CODE_REVIEWER,
      `Review the code: ${target}`
    );
    return result.text;
  }

  /**
   * 生成测试
   */
  async generateTests(target: string): Promise<string> {
    const result = await this.runWithHooks(
      EXTENDED_AGENT_NAMES.TEST_ENGINEER,
      `Generate tests for: ${target}`
    );
    return result.text;
  }

  /**
   * 编写文档
   */
  async writeDocs(target: string): Promise<string> {
    const result = await this.runWithHooks(
      EXTENDED_AGENT_NAMES.DOC_WRITER,
      `Write documentation for: ${target}`
    );
    return result.text;
  }

  /**
   * 调试
   */
  async debug(target: string): Promise<string> {
    const result = await this.runWithHooks(
      EXTENDED_AGENT_NAMES.DEBUGGER,
      `Debug this issue: ${target}`
    );
    return result.text;
  }

  /**
   * 重构
   */
  async refactor(target: string): Promise<string> {
    const result = await this.runWithHooks(
      EXTENDED_AGENT_NAMES.REFACTORER,
      `Refactor this code: ${target}`
    );
    return result.text;
  }

  /**
   * 安全审计
   */
  async securityAudit(target: string): Promise<string> {
    const result = await this.runWithHooks(
      EXTENDED_AGENT_NAMES.SECURITY_AUDITOR,
      `Audit security of: ${target}`
    );
    return result.text;
  }
}
