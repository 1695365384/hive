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

  initialize(context: AgentContext): void {
    this.context = context;
  }

  // ============================================
  // 核心 Agent 方法
  // ============================================

  /**
   * 使用 Explore Agent 探索代码库
   */
  async explore(prompt: string, thoroughness: ThoroughnessLevel = 'medium'): Promise<string> {
    const result = await this.context.runner.execute(
      CORE_AGENT_NAMES.EXPLORE,
      buildExplorePrompt(prompt, thoroughness)
    );
    return result.text;
  }

  /**
   * 使用 Plan Agent 研究代码库
   */
  async plan(prompt: string): Promise<string> {
    const result = await this.context.runner.execute(
      CORE_AGENT_NAMES.PLAN,
      buildPlanPrompt(prompt)
    );
    return result.text;
  }

  /**
   * 使用 General Agent 执行任务
   */
  async general(prompt: string): Promise<string> {
    const result = await this.context.runner.execute(CORE_AGENT_NAMES.GENERAL, prompt);
    return result.text;
  }

  /**
   * 运行指定子 Agent
   */
  async run(name: AgentType, prompt: string): Promise<AgentResult> {
    return this.context.runner.execute(name, prompt);
  }

  // ============================================
  // 扩展 Agent 方法
  // ============================================

  /**
   * 代码审查
   */
  async reviewCode(target: string): Promise<string> {
    const result = await this.context.runner.execute(
      EXTENDED_AGENT_NAMES.CODE_REVIEWER,
      `Review the code: ${target}`
    );
    return result.text;
  }

  /**
   * 生成测试
   */
  async generateTests(target: string): Promise<string> {
    const result = await this.context.runner.execute(
      EXTENDED_AGENT_NAMES.TEST_ENGINEER,
      `Generate tests for: ${target}`
    );
    return result.text;
  }

  /**
   * 编写文档
   */
  async writeDocs(target: string): Promise<string> {
    const result = await this.context.runner.execute(
      EXTENDED_AGENT_NAMES.DOC_WRITER,
      `Write documentation for: ${target}`
    );
    return result.text;
  }

  /**
   * 调试
   */
  async debug(target: string): Promise<string> {
    const result = await this.context.runner.execute(
      EXTENDED_AGENT_NAMES.DEBUGGER,
      `Debug this issue: ${target}`
    );
    return result.text;
  }

  /**
   * 重构
   */
  async refactor(target: string): Promise<string> {
    const result = await this.context.runner.execute(
      EXTENDED_AGENT_NAMES.REFACTORER,
      `Refactor this code: ${target}`
    );
    return result.text;
  }

  /**
   * 安全审计
   */
  async securityAudit(target: string): Promise<string> {
    const result = await this.context.runner.execute(
      EXTENDED_AGENT_NAMES.SECURITY_AUDITOR,
      `Audit security of: ${target}`
    );
    return result.text;
  }
}
