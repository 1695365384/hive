/**
 * 内置 Agent 定义
 *
 * 核心代理：Explore / Plan / General / Schedule / Office /
 * Librarian / Metis / Momus / Oracle（+ critic/arbiter 仅用于 harness）
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
  SCHEDULE: 'schedule',
  CRITIC: 'critic',
  ARBITER: 'arbiter',
  OFFICE: 'office',
  LIBRARIAN: 'librarian',
  METIS: 'metis',
  MOMUS: 'momus',
  ORACLE: 'oracle',
} as const;

// ============================================
// 核心 Agent 配置
// ============================================

/**
 * 核心代理
 */
export const CORE_AGENTS: Record<
  | 'explore'
  | 'plan'
  | 'general'
  | 'schedule'
  | 'critic'
  | 'arbiter'
  | 'office'
  | 'librarian'
  | 'metis'
  | 'momus'
  | 'oracle',
  AgentConfig
> = {
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
    maxTurns: 15,
  },

  schedule: {
    type: 'schedule',
    description: 'Schedule management agent for creating, listing, pausing, resuming, and removing scheduled tasks.',
    tools: ['schedule'],
    maxTurns: 10,
  },

  critic: {
    type: 'critic',
    description: 'Adversarial reviewer for quality assurance. Critically examines outputs, finds flaws, gaps, and security issues. Part of the triadic adversarial harness.',
    tools: ['file', 'glob', 'grep', 'web-search', 'web-fetch', 'env'],
    maxTurns: 10,
  },

  arbiter: {
    type: 'arbiter',
    description: 'Neutral synthesizer that resolves conflicts between thesis and antithesis. Produces final integrated output with quality scoring. Part of the triadic adversarial harness.',
    tools: ['file', 'glob', 'grep', 'web-search', 'web-fetch', 'env'],
    maxTurns: 10,
  },

  office: {
    type: 'office',
    description: 'Office document specialist for creating PowerPoint, Word, and Excel documents using officecli.',
    tools: ['bash', 'file', 'glob', 'grep', 'send-file', 'env'],
    maxTurns: 30,
  },

  librarian: {
    type: 'librarian',
    description: 'Evidence-first documentation and API retrieval agent. Returns cited sources (docs, GitHub, permanent links) instead of guessing.',
    tools: ['file', 'glob', 'grep', 'web-search', 'web-fetch', 'env'],
    maxTurns: 12,
  },

  metis: {
    type: 'metis',
    description: 'Plan advisor that surfaces ambiguities, missing requirements, and risky assumptions before planning. May ask the user clarifying questions.',
    tools: ['file', 'glob', 'grep', 'web-search', 'web-fetch', 'ask-user', 'env'],
    maxTurns: 10,
  },

  momus: {
    type: 'momus',
    description: 'Strict plan reviewer. Approves or rejects implementation plans before execution. Does not write code.',
    tools: ['file', 'glob', 'grep', 'web-search', 'web-fetch', 'env'],
    maxTurns: 10,
  },

  oracle: {
    type: 'oracle',
    description: 'Architecture and root-cause diagnosis specialist. Read-only analysis for hard design decisions and tricky bugs. Does not modify files.',
    tools: ['file', 'glob', 'grep', 'web-search', 'web-fetch', 'env'],
    maxTurns: 15,
  },
};

/**
 * 所有内置 Agent（= 核心代理）
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
