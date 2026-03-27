/**
 * 内置 Agent 定义
 *
 * 核心三代理：Explore / Plan / General
 */

import type { AgentType, AgentConfig } from './types.js';
import {
  EXPLORE_AGENT_PROMPT,
  PLAN_AGENT_PROMPT,
  GENERAL_AGENT_PROMPT,
} from '../prompts/prompts.js';

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
    prompt: EXPLORE_AGENT_PROMPT,
    tools: ['Read', 'Glob', 'Grep'],
    model: 'claude-haiku-4-5',
    maxTurns: 5,
  },

  plan: {
    type: 'plan',
    description: 'Research agent for planning mode to gather context before planning.',
    prompt: PLAN_AGENT_PROMPT,
    tools: ['Read', 'Glob', 'Grep'],
    maxTurns: 10,
  },

  general: {
    type: 'general',
    description: 'General-purpose agent capable of handling complex, multi-step tasks.',
    prompt: GENERAL_AGENT_PROMPT,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
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
