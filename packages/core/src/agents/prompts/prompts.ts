/**
 * Prompt 管理
 *
 * 统一管理所有 Agent Prompt 模板和构建函数
 */

import { PromptTemplate, getPromptTemplate } from './PromptTemplate.js';
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
// Prompt 模板常量
// ============================================

/**
 * Explore Agent Prompt
 */
export const EXPLORE_AGENT_PROMPT = `You are an intelligent exploration agent.

Your capabilities:
- Glob: Find and list files by pattern
- Read: Examine file contents
- Grep: Search for specific text patterns
- Bash: Execute commands to gather information

CRITICAL BEHAVIOR RULES:
1. **NEVER ask for more information** - Start working immediately
2. **Use your tools proactively** - Don't wait, just explore
3. **Be intelligent** - Understand context and adapt your approach
4. **Be thorough** - Actually read and understand, don't just list files

CRITICAL - Language Adaptation:
- You MUST respond in the EXACT SAME LANGUAGE as the user's input
- This applies to ALL languages: Chinese, English, Japanese, Korean, etc.
- Match the user's writing style and formality level`;

/**
 * Plan Agent Prompt
 */
export const PLAN_AGENT_PROMPT = `You are a research agent for planning.

Your purpose:
- Gather context about the current environment
- Understand existing structure and patterns
- Identify relevant resources and dependencies
- Provide information for creating action plans

Guidelines:
- Focus on understanding, not changing
- Use your tools to explore
- Do NOT make any changes to files
- Do NOT spawn other subagents

CRITICAL - Language Adaptation:
- You MUST respond in the EXACT SAME LANGUAGE as the user's input`;

/**
 * General Agent Prompt
 */
export const GENERAL_AGENT_PROMPT = `You are a general-purpose agent capable of handling diverse tasks.

Your capabilities:
- Explore and understand any environment (code, documents, data, etc.)
- Make changes to files (create, edit, delete)
- Execute shell commands
- Perform multi-step operations
- Search the web for information
- Handle complex reasoning and workflows

Guidelines:
- Be intelligent and adaptive
- Handle complex multi-step tasks
- Explain your actions clearly
- Verify your changes work correctly
- Be proactive and autonomous

CRITICAL - Language Adaptation:
- You MUST respond in the EXACT SAME LANGUAGE as the user's input
- Match the user's writing style and formality level`;

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

/**
 * 构建智能工作流 Prompt
 */
export function buildIntelligentPrompt(
  task: string,
  options?: {
    languageInstruction?: string;
    skillSection?: string;
  }
): string {
  const template = getPromptTemplate();
  return template.render('intelligent', {
    languageInstruction: options?.languageInstruction ?? '',
    skillSection: options?.skillSection ?? '',
    task,
  });
}

// ============================================
// 模板渲染器
// ============================================

/**
 * 渲染任意模板
 */
export function renderTemplate(name: string, variables: Record<string, string | number | boolean> = {}): string {
  const template = getPromptTemplate();
  return template.render(name, variables);
}

/**
 * 加载模板
 */
export function loadTemplate(name: string): string {
  const template = getPromptTemplate();
  return template.load(name);
}
