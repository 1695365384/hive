/**
 * 技能系统模块
 *
 * 提供模块化的技能管理功能：
 * - 技能加载
 * - 技能匹配
 * - 技能注册
 *
 * 使用方式：
 * ```typescript
 * import { SkillRegistry, initializeSkills } from '@hive/core/skills';
 *
 * // 初始化技能系统
 * const registry = await initializeSkills();
 *
 * // 匹配技能
 * const match = registry.match('帮我 review 代码');
 * if (match) {
 *   console.log(`Matched skill: ${match.skill.metadata.name}`);
 * }
 *
 * // 列出所有技能
 * const skills = registry.getAllMetadata();
 * ```
 */

// ============================================
// 类型导出
// ============================================

export type {
  SkillMetadata,
  Skill,
  SkillContext,
  SkillLoaderOptions,
  SkillMatchResult,
  SkillSystemConfig,
} from './types.js';

// ============================================
// 加载器导出
// ============================================

export {
  SkillLoader,
  createSkillLoader,
  parseFrontmatter,
} from './loader.js';

// ============================================
// 匹配器导出
// ============================================

export {
  SkillMatcher,
  createSkillMatcher,
  extractTriggerPhrases,
} from './matcher.js';

// ============================================
// 注册表导出
// ============================================

export {
  SkillRegistry,
  getSkillRegistry,
  createSkillRegistry,
  initializeSkills,
} from './registry.js';
