/**
 * 内置 Agent 定义
 *
 * Claude Code 风格的三代理系统 + 扩展 Agent
 * 所有 Agent 的 prompt 统一在这里定义
 */

import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import type { AgentType, AgentConfig, ThoroughnessLevel } from './types.js';

// ============================================
// Prompt 模板（统一管理）
// ============================================

/**
 * 探索严格程度提示模板
 */
export const THOROUGHNESS_PROMPTS: Record<ThoroughnessLevel, string> = {
  quick: 'Perform a quick search - focus on speed and most relevant results.',
  medium: 'Perform a balanced exploration - thorough but efficient.',
  'very-thorough': 'Perform a comprehensive analysis - be exhaustive.',
};

/**
 * Explore Agent Prompt - 通用探索代理
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

How to handle different types of tasks:
- Code projects: Find source files, read key files, understand architecture
- Documents: Find relevant documents, read them, summarize key points
- Data files: Find data, examine structure, provide insights
- General questions: Search for relevant information, synthesize findings

Exploration Strategy:
1. First, understand what you're working with: Use Glob to see the structure
2. Identify key files: Config files, main entry points, documentation
3. Read and understand: Actually read the content, don't just scan
4. Synthesize: Provide a comprehensive, actionable summary

Output Guidelines:
- Provide structured, comprehensive summaries
- Include specific file paths and relevant quotes
- Be practical and actionable
- Do NOT make any changes to files

CRITICAL - Language Adaptation:
- You MUST respond in the EXACT SAME LANGUAGE as the user's input
- This applies to ALL languages: Chinese, English, Japanese, Korean, etc.
- Match the user's writing style and formality level

Thoroughness levels:
- quick: Fast overview
- medium: Balanced exploration
- very-thorough: Deep comprehensive analysis`;

/**
 * Plan Agent Prompt - 计划研究代理
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
- You MUST respond in the EXACT SAME LANGUAGE as the user's input
- This applies to ALL languages`;

/**
 * General Agent Prompt - 通用执行代理
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
- This applies to ALL languages: Chinese, English, Japanese, Korean, etc.
- Match the user's writing style and formality level`;

// ============================================
// 核心 Agent 定义
// ============================================

/**
 * Claude Code 核心三代理
 *
 * 1. Explore - 快速搜索和分析代码库
 * 2. Plan - 计划模式研究代理
 * 3. General - 通用目的代理
 */
export const CORE_AGENTS: Record<'explore' | 'plan' | 'general', AgentConfig> = {
  /**
   * Explore Agent - 快速搜索和分析代码库
   *
   * - 模型: Haiku（快速、低延迟）
   * - 工具: 只读工具（Read, Glob, Grep）
   * - 用途: 文件发现、代码搜索、代码库探索
   */
  explore: {
    type: 'explore',
    description: 'Fast agent optimized for searching and analyzing codebases.',
    prompt: EXPLORE_AGENT_PROMPT,
    tools: ['Read', 'Glob', 'Grep'],
    model: 'claude-haiku-4-5',
    maxTurns: 5,
  },

  /**
   * Plan Agent - 计划模式研究代理
   *
   * - 模型: 继承自主对话
   * - 工具: 只读工具
   * - 用途: 用于规划的代码库研究
   */
  plan: {
    type: 'plan',
    description: 'Research agent for planning mode to gather context before planning.',
    prompt: PLAN_AGENT_PROMPT,
    tools: ['Read', 'Glob', 'Grep'],
    maxTurns: 10,
  },

  /**
   * General Agent - 通用目的代理
   *
   * - 模型: 继承自主对话
   * - 工具: 所有工具
   * - 用途: 复杂研究、多步骤操作、代码修改
   */
  general: {
    type: 'general',
    description: 'General-purpose agent capable of handling complex, multi-step tasks requiring exploration and modification.',
    prompt: GENERAL_AGENT_PROMPT,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    maxTurns: 20,
  },
};

// ============================================
// 扩展 Agent 定义
// ============================================

/**
 * 扩展 Agent 模板
 */
export const EXTENDED_AGENTS: Record<string, AgentConfig> = {
  /**
   * 代码审查 Agent
   */
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

  /**
   * 测试工程师 Agent
   */
  'test-engineer': {
    type: 'test-engineer',
    description: 'Test generation specialist that writes comprehensive tests.',
    prompt: `You are a test engineer. Generate comprehensive tests.
Focus on:
1. Unit tests
2. Edge cases
3. Integration tests
4. Test coverage`,
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
    maxTurns: 15,
  },

  /**
   * 文档撰写者 Agent
   */
  'doc-writer': {
    type: 'doc-writer',
    description: 'Technical writer for documentation.',
    prompt: `You are a technical writer. Create clear documentation.
Focus on:
1. API documentation
2. Usage examples
3. Installation guides`,
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
    maxTurns: 10,
  },

  /**
   * 调试专家 Agent
   */
  'debugger': {
    type: 'debugger',
    description: 'Bug detective that analyzes and fixes issues.',
    prompt: `You are a debugging expert. Find and fix bugs.
Focus on:
1. Root cause analysis
2. Stack trace interpretation
3. Reproduction steps

Always identify the root cause before suggesting fixes.`,
    tools: ['Read', 'Glob', 'Grep', 'Bash'],
    maxTurns: 15,
  },

  /**
   * 重构专家 Agent
   */
  'refactorer': {
    type: 'refactorer',
    description: 'Code refactoring specialist.',
    prompt: `You are a refactoring expert. Improve code quality.
Focus on:
1. Reducing complexity
2. Improving readability
3. Applying design patterns

Preserve existing behavior while improving code structure.`,
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
    maxTurns: 20,
  },

  /**
   * 安全审计 Agent
   */
  'security-auditor': {
    type: 'security-auditor',
    description: 'Security specialist for identifying vulnerabilities.',
    prompt: `You are a security auditor. Identify security risks.
Focus on:
1. OWASP Top 10
2. Secure coding practices
3. Authentication flaws

Identify risks and provide remediation steps.`,
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

/**
 * 构建探索 prompt
 */
export function buildExplorePrompt(task: string, thoroughness: ThoroughnessLevel = 'medium'): string {
  return `${THOROUGHNESS_PROMPTS[thoroughness]}

## Task
${task}

## CRITICAL Instructions

1. **Start IMMEDIATELY** - Do NOT ask for more information
2. **Use your tools** - You have Glob, Read, Grep, Bash available
3. **Be proactive** - Take initiative to explore and understand
4. **Match user's language** - Respond in the EXACT SAME LANGUAGE as the task

## Exploration Strategy

### Step 1: Understand the Environment
\`\`\`
# List directory contents
ls -la

# Find relevant files by extension
Glob: **/*.{ts,js,tsx,jsx,json,md,py,go,rs,java,yaml,yml}
\`\`\`

### Step 2: Read Key Files
- Configuration: package.json, tsconfig.json, pyproject.toml, Cargo.toml, go.mod
- Documentation: README*, docs/, *.md
- Entry points: index.*, main.*, app.*, server.*, src/, lib/

### Step 3: Analyze and Synthesize
Answer these questions:
- What is this project/directory about?
- What is the structure/architecture?
- What are the main components?
- What technologies are used?
- Any notable patterns or issues?

## Response Format
Provide a structured analysis (match user's language):
- **Overview**: What is this about?
- **Structure**: How is it organized?
- **Tech Stack**: What technologies are used?
- **Key Files**: What are the important files?
- **Findings**: What did you discover?
- **Recommendations**: Any suggestions?

Start exploring NOW!`;
}

/**
 * 构建 Plan 研究 prompt
 */
export function buildPlanPrompt(task: string): string {
  return `Research the codebase for planning:

## Task
${task}

## Your Goal
Gather context about:
1. What files/components are relevant?
2. How is this currently implemented?
3. What are the dependencies?
4. What patterns are used?

CRITICAL: Respond in the EXACT SAME LANGUAGE as the task above.

Provide information for creating a plan.`;
}
