/**
 * 技能能力
 *
 * 管理技能注册、匹配和加载
 */

import type { AgentCapability, AgentContext } from '../core/types.js';
import type { Skill, SkillMatchResult } from '../../skills/index.js';

/**
 * 技能能力实现
 */
export class SkillCapability implements AgentCapability {
  readonly name = 'skill';
  private context!: AgentContext;

  initialize(context: AgentContext): void {
    this.context = context;
  }

  /**
   * 列出所有技能
   */
  listAll(): Skill[] {
    return this.context.skillRegistry.getAll();
  }

  /**
   * 列出所有技能元数据
   */
  listMetadata() {
    return this.context.skillRegistry.getAllMetadata();
  }

  /**
   * 获取指定技能
   */
  get(name: string): Skill | undefined {
    return this.context.skillRegistry.get(name);
  }

  /**
   * 匹配技能（带 Hook 触发）
   */
  async match(input: string, sessionId?: string): Promise<SkillMatchResult | null> {
    const result = this.context.skillRegistry.match(input);

    // 触发 skill:match hook
    if (result) {
      await this.context.hookRegistry.emit('skill:match', {
        sessionId: sessionId || 'system',
        input,
        matchedSkill: result.skill.metadata.name,
        matchScore: 1.0, // 默认匹配分数
        timestamp: new Date(),
      });
    }

    return result;
  }

  /**
   * 同步匹配技能（向后兼容）
   */
  matchSync(input: string): SkillMatchResult | null {
    return this.context.skillRegistry.match(input);
  }

  /**
   * 注册技能
   */
  register(skill: Skill): void {
    this.context.skillRegistry.register(skill);
  }

  /**
   * 生成技能指令
   */
  generateInstruction(skill: Skill): string {
    return this.context.skillRegistry.generateSkillInstruction(skill);
  }

  /**
   * 生成技能列表描述
   */
  generateListDescription(): string {
    return this.context.skillRegistry.generateSkillListDescription();
  }

  /**
   * 获取技能数量
   */
  get size(): number {
    return this.context.skillRegistry.size;
  }
}
