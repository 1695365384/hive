/**
 * 内置 Agent 定义
 *
 * 核心三代理 + 扩展 Agent 配置
 */

import type { AgentType, AgentConfig } from './types.js';
import {
  EXPLORE_AGENT_PROMPT,
  PLAN_AGENT_PROMPT,
  GENERAL_AGENT_PROMPT,
} from '../prompts/prompts.js';

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

// ============================================
// 扩展 Agent 配置
// ============================================

/**
 * 扩展 Agent 模板
 */
export const EXTENDED_AGENTS: Record<string, AgentConfig> = {
  'code-reviewer': {
    type: 'code-reviewer',
    description: 'Expert code reviewer for quality and security reviews.',
    prompt: `You are a senior code reviewer. Analyze code quality and suggest improvements.
Focus on:
1. Security vulnerabilities (OWASP Top 10)
2. Performance issues
3. Code maintainability
4. Best practices

Always provide specific line numbers and suggestions.`,
    tools: ['Read', 'Glob', 'Grep'],
    maxTurns: 10,
  },

  'test-engineer': {
    type: 'test-engineer',
    description: 'Test generation specialist.',
    prompt: `You are a test engineer. Generate comprehensive tests.
Focus on: Unit tests, Edge cases, Integration tests, Test coverage`,
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
    maxTurns: 15,
  },

  'doc-writer': {
    type: 'doc-writer',
    description: 'Technical writer for documentation.',
    prompt: `You are a technical writer. Create clear documentation.
Focus on: API documentation, Usage examples, Installation guides`,
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
    maxTurns: 10,
  },

  'debugger': {
    type: 'debugger',
    description: 'Bug detective that analyzes and fixes issues.',
    prompt: `You are a debugging expert. Find and fix bugs.
Focus on: Root cause analysis, Stack trace interpretation, Reproduction steps`,
    tools: ['Read', 'Glob', 'Grep', 'Bash'],
    maxTurns: 15,
  },

  'refactorer': {
    type: 'refactorer',
    description: 'Code refactoring specialist.',
    prompt: `You are a refactoring expert. Improve code quality.
Focus on: Reducing complexity, Improving readability, Applying design patterns`,
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
    maxTurns: 20,
  },

  'security-auditor': {
    type: 'security-auditor',
    description: 'Security specialist for identifying vulnerabilities.',
    prompt: `You are a security auditor. Identify security risks.
Focus on: OWASP Top 10, Secure coding practices, Authentication flaws`,
    tools: ['Read', 'Glob', 'Grep'],
    maxTurns: 10,
  },
};

/**
 * 所有内置 Agent
 */
export const BUILTIN_AGENTS: Record<string, AgentConfig> = {
  ...CORE_AGENTS,
  ...EXTENDED_AGENTS,
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
 * 获取核心 Agent 名称列表
 */
export function getCoreAgentNames(): string[] {
  return Object.keys(CORE_AGENTS);
}

/**
 * 获取扩展 Agent 名称列表
 */
export function getExtendedAgentNames(): string[] {
  return Object.keys(EXTENDED_AGENTS);
}

/**
 * 获取所有 Agent 名称列表
 */
export function getAllAgentNames(): string[] {
  return Object.keys(BUILTIN_AGENTS);
}
