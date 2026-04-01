/**
 * 内置 Agent 定义
 *
 * 核心两代理：Explore（只读）/ General（全量）
 * 提示词内容统一在 templates/ 目录的 .md 文件中维护，不在此处硬编码。
 */

import type { AgentConfig } from './types.js';

// ============================================
// Agent 名称常量
// ============================================

/** 内置 Agent 名称 */
export const AGENT_NAMES = {
  EXPLORE: 'explore',
  GENERAL: 'general',
  /** @deprecated Use EXPLORE instead */
  PLAN: 'plan',
  /** @deprecated Use GENERAL instead */
  EVALUATOR: 'evaluator',
} as const;

// ============================================
// 核心 Agent 配置
// ============================================

/**
 * 核心两代理
 */
export const CORE_AGENTS: Record<'explore' | 'general', AgentConfig> = {
  explore: {
    type: 'explore',
    description: 'Read-only agent for searching, analyzing codebases, and deep research.',
    tools: ['file', 'glob', 'grep', 'web-search', 'web-fetch', 'env'],
    maxTurns: 10,
  },

  general: {
    type: 'general',
    description: 'Full-access agent for executing tasks, modifying files, and running commands.',
    tools: ['bash', 'file', 'glob', 'grep', 'web-search', 'web-fetch', 'ask-user', 'send-file', 'env'],
    maxTurns: 30,
  },
};

/**
 * 所有内置 Agent（= 核心两代理）
 */
export const BUILTIN_AGENTS: Record<string, AgentConfig> = {
  ...CORE_AGENTS,
};

// ============================================
// 别名映射
// ============================================

const ALIAS_MAP: Record<string, string> = {
  plan: 'explore',
  evaluator: 'general',
};

// ============================================
// 辅助函数
// ============================================

/**
 * 获取 Agent 配置
 *
 * 支持 'plan' → 'explore'、'evaluator' → 'general' 别名。
 */
export function getAgentConfig(name: string): AgentConfig | undefined {
  const resolved = ALIAS_MAP[name] ?? name;
  return BUILTIN_AGENTS[resolved];
}

/**
 * 获取所有 Agent 名称列表（仅核心类型，不含别名）
 */
export function getAllAgentNames(): string[] {
  return Object.keys(CORE_AGENTS);
}
