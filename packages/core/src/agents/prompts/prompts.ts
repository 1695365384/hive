/**
 * Prompt 管理
 *
 * 统一管理所有 Agent Prompt 构建函数。
 * 提示词内容统一在 templates/ 目录的 .md 文件中维护。
 */

import { getPromptTemplate } from './PromptTemplate.js';
import type { ThoroughnessLevel } from '../types.js';

// ============================================
// 探索严格程度提示
// ============================================

export const THOROUGHNESS_PROMPTS: Record<ThoroughnessLevel, string> = {
  quick: 'Perform a quick search - focus on speed and most relevant results.',
  medium: 'Perform a balanced exploration - thorough but efficient.',
  'very-thorough': 'Perform a comprehensive analysis - be exhaustive.',
};

// ============================================
// Prompt 构建函数
// ============================================

/**
 * 构建探索 Prompt
 */
export function buildExplorePrompt(task: string, thoroughness: ThoroughnessLevel = 'medium'): string {
  const template = getPromptTemplate();
  return template.render('explore', {
    thoroughness: THOROUGHNESS_PROMPTS[thoroughness],
    task,
  });
}

/**
 * 构建计划 Prompt
 */
export function buildPlanPrompt(task: string): string {
  const template = getPromptTemplate();
  return template.render('plan', { task });
}
