/**
 * 内置 Agent 定义
 *
 * 核心三代理：Explore（只读）/ Plan（深度分析）/ General（全量）
 * 提示词内容统一在 templates/ 目录的 .md 文件中维护，不在此处硬编码。
 */

import type { AgentConfig } from './types.js';

// ============================================
// Agent 名称常量
// ============================================

/** 内置 Agent 名称 */
export const AGENT_NAMES = {
  EXPLORE: 'explore',
  PLAN: 'plan',
  GENERAL: 'general',
} as const;

// ============================================
// 核心 Agent 配置
// ============================================

/**
 * 核心三代理
 */
export const CORE_AGENTS: Record<'explore' | 'plan' | 'general', AgentConfig> = {
  explore: {
    type: 'explore',
    description: 'Read-only agent for searching, analyzing codebases, and deep research.',
    tools: ['file', 'glob', 'grep', 'web-search', 'web-fetch', 'env'],
    maxTurns: 10,
  },

  plan: {
    type: 'plan',
    description: 'Deep analysis agent for architecture decisions, dependency tracing, and implementation planning.',
    tools: ['file', 'glob', 'grep', 'web-search', 'web-fetch', 'env'],
    maxTurns: 15,
  },

  general: {
    type: 'general',
    description: 'Full-access agent for executing tasks, modifying files, and running commands.',
    tools: ['bash', 'file', 'glob', 'grep', 'web-search', 'web-fetch', 'ask-user', 'send-file', 'env'],
    maxTurns: 30,
  },
};

/**
 * 所有内置 Agent（= 核心三代理）
 */
export const BUILTIN_AGENTS: Record<string, AgentConfig> = {
  ...CORE_AGENTS,
};

// ============================================
// 辅助函数
// ============================================

/**
 * 获取 Agent 配置
 */
export function getAgentConfig(name: string): AgentConfig | undefined {
  return BUILTIN_AGENTS[name];
}

/**
 * 获取所有 Agent 名称列表（仅核心类型，不含别名）
 */
export function getAllAgentNames(): string[] {
  return Object.keys(CORE_AGENTS);
}
