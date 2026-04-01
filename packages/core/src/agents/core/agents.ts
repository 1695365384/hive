/**
 * 内置 Agent 定义
 *
 * 核心三代理：Explore / Plan / General
 * 提示词内容统一在 templates/ 目录的 .md 文件中维护，不在此处硬编码。
 */

import type { AgentConfig } from './types.js';

// ============================================
// Agent 名称常量
// ============================================

/** 所有内置 Agent 名称 */
export const AGENT_NAMES = {
  EXPLORE: 'explore',
  PLAN: 'plan',
  GENERAL: 'general',
} as const;

// ============================================
// 核心 Agent 配置
// ============================================

/**
 * Claude Code 核心三代理
 */
export const CORE_AGENTS: Record<'explore' | 'plan' | 'general', AgentConfig> = {
  explore: {
    type: 'explore',
    description: 'Fast agent optimized for searching and analyzing codebases.',
    tools: ['file', 'glob', 'grep', 'web-search', 'web-fetch'],
    maxTurns: 5,
  },

  plan: {
    type: 'plan',
    description: 'Research agent for planning mode to gather context before planning.',
    tools: ['file', 'glob', 'grep', 'web-search', 'web-fetch'],
    maxTurns: 10,
  },

  general: {
    type: 'general',
    description: 'General-purpose agent capable of handling complex, multi-step tasks.',
    tools: ['bash', 'file', 'glob', 'grep', 'web-search', 'web-fetch', 'ask-user', 'send-file'],
    maxTurns: 20,
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
 * 获取所有 Agent 名称列表
 */
export function getAllAgentNames(): string[] {
  return Object.keys(BUILTIN_AGENTS);
}
