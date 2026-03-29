/**
 * 子 Agent 工具 — 将 Explore/Plan 注册为 AI SDK Tool
 *
 * 主 Agent 可通过工具调用动态 spawn 子 Agent。
 * 子 Agent 工具不在 ToolRegistry 注册，仅在 WorkflowCapability 中注入，
 * 避免子 Agent 自己看到这些工具导致无限递归。
 *
 * Claude Code 对齐：
 * - 主 Agent 自主决定何时委派
 * - 子 Agent 在独立 context 中运行（非流式）
 * - 子 Agent 返回文本摘要，主 Agent 继续
 */

import { tool, zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import type { AgentContext } from '../../agents/core/types.js';

// ============================================
// 类型
// ============================================

/** 子 Agent 工具配置 */
interface SubagentToolConfig {
  /** 工具名称（如 explore, plan） */
  name: string;
  /** 工具描述（LLM 用此决定何时调用） */
  description: string;
  /** 对应的 Agent 名称（AgentRunner.execute 的第一个参数） */
  agentName: string;
}

// ============================================
// 常量
// ============================================

/** 所有子 Agent 工具共享的输入 schema */
const SUBAGENT_INPUT_SCHEMA = zodSchema(
  z.object({
    prompt: z.string().describe('The task to delegate to the sub-agent'),
  }),
);

// ============================================
// 工厂函数
// ============================================

/**
 * 创建单个子 Agent 工具
 *
 * tool 的 execute() 内部调用 AgentRunner.execute()，
 * 复用现有的 Agent 执行基础设施（预设 prompt、工具白名单、maxSteps）。
 */
export function createSubagentTool(
  config: SubagentToolConfig,
  context: AgentContext,
): Tool {
  return tool({
    description: config.description,
    inputSchema: SUBAGENT_INPUT_SCHEMA,
    execute: async (input): Promise<string> => {
      const result = await context.runner.execute(
        config.agentName,
        input.prompt,
      );

      if (result.error) {
        return `Sub-agent error: ${result.error}`;
      }

      return result.text || 'Sub-agent returned no output';
    },
  });
}

/**
 * 创建所有子 Agent 工具
 *
 * 只创建 explore 和 plan，不创建 general（主 Agent 本身就是 general）。
 */
export function createAllSubagentTools(context: AgentContext): Record<string, Tool> {
  return {
    explore: createSubagentTool({
      name: 'explore',
      description: [
        'Delegate to an Explore sub-agent for read-only codebase research.',
        'The sub-agent has Glob, Grep, Read, WebSearch, WebFetch (read-only).',
        'Returns a summary of findings.',
        '',
        'Use for: discovering files, understanding architecture, broad code search.',
        'Do NOT use for simple lookups — use Read/Grep directly.',
      ].join('\n'),
      agentName: 'explore',
    }, context),

    plan: createSubagentTool({
      name: 'plan',
      description: [
        'Delegate to a Plan sub-agent for in-depth research and analysis.',
        'The sub-agent has Glob, Grep, Read, WebSearch, WebFetch (read-only).',
        'Returns a structured analysis.',
        '',
        'Use for: complex planning, dependency analysis, design exploration.',
        'Do NOT use when you already have enough context.',
      ].join('\n'),
      agentName: 'plan',
    }, context),
  };
}
