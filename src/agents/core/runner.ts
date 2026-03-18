/**
 * Agent 运行器
 *
 * 负责执行子 Agent 并返回结果
 */

import { query, type Options, type McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import type { AgentConfig, AgentExecuteOptions, AgentResult, ThoroughnessLevel } from './types.js';
import { getAgentConfig } from './agents.js';
import { buildExplorePrompt, buildPlanPrompt } from '../prompts/prompts.js';

/**
 * Agent 运行器
 *
 * 执行子 Agent 并管理结果
 */
export class AgentRunner {
  private providerManager: {
    getActiveProvider: () => { base_url: string; api_key: string } | null;
    getMcpServersForAgent: () => Record<string, McpServerConfig>;
  };

  constructor(providerManager?: {
    getActiveProvider: () => { base_url: string; api_key: string } | null;
    getMcpServersForAgent: () => Record<string, McpServerConfig>;
  }) {
    this.providerManager = providerManager || {
      getActiveProvider: () => null,
      getMcpServersForAgent: () => ({}),
    };
  }

  /**
   * 执行 Agent
   */
  async execute(
    agentName: string,
    prompt: string,
    options?: AgentExecuteOptions
  ): Promise<AgentResult> {
    const agentConfig = getAgentConfig(agentName);
    if (!agentConfig) {
      return {
        text: '',
        tools: [],
        success: false,
        error: `Unknown agent: ${agentName}`,
      };
    }

    return this.executeWithConfig(agentConfig, prompt, options);
  }

  /**
   * 使用配置执行 Agent
   */
  async executeWithConfig(
    config: AgentConfig,
    prompt: string,
    options?: AgentExecuteOptions
  ): Promise<AgentResult> {
    const result: AgentResult = {
      text: '',
      tools: [],
      success: true,
    };

    // 应用提供商配置 - 构建环境变量对象
    const provider = this.providerManager.getActiveProvider();
    const envVars: Record<string, string | undefined> = { ...process.env };
    if (provider) {
      envVars.ANTHROPIC_BASE_URL = provider.base_url;
      envVars.ANTHROPIC_API_KEY = provider.api_key;
    }

    // 获取 MCP 服务器
    const mcpServers = this.providerManager.getMcpServersForAgent();

    // 构建选项 - 显式传递环境变量
    // 使用 tools 选项指定可用工具（而不是 allowedTools）
    const queryOptions: Options = {
      cwd: options?.cwd,
      tools: config.tools || options?.allowedTools,
      maxTurns: config.maxTurns || options?.maxTurns || 10,
      model: config.model || options?.model,
      systemPrompt: config.prompt,
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
      permissionMode: options?.permissionMode || 'bypassPermissions',
      env: envVars,
    };

    try {
      for await (const message of query({ prompt, options: queryOptions })) {
        // 处理最终结果
        if ('result' in message && message.result) {
          const text = String(message.result);
          result.text += text;
          options?.onText?.(text);
        }

        // 处理 assistant 消息 - 提取文本内容
        if ('type' in message && message.type === 'assistant' && 'message' in message) {
          const msg = message as { message?: { content?: unknown[] } };
          if (msg.message?.content && Array.isArray(msg.message.content)) {
            for (const block of msg.message.content) {
              if (typeof block === 'object' && block !== null) {
                const b = block as { type?: string; text?: string; name?: string; input?: unknown };
                // 提取文本块
                if (b.type === 'text' && b.text) {
                  result.text += b.text;
                  options?.onText?.(b.text);
                }
                // 记录工具调用
                if (b.type === 'tool_use' && b.name) {
                  if (!result.tools.includes(b.name)) {
                    result.tools.push(b.name);
                    options?.onTool?.(b.name, b.input);
                  }
                }
              }
            }
          }
        }

        // 处理工具调用进度 - SDK 通过 tool_progress 消息发送
        if ('type' in message && message.type === 'tool_progress') {
          const toolMsg = message as { tool_name: string; tool_use_id?: string };
          const toolName = toolMsg.tool_name;
          if (!result.tools.includes(toolName)) {
            result.tools.push(toolName);
            options?.onTool?.(toolName, { tool_use_id: toolMsg.tool_use_id });
          }
        }

        // 处理 usage
        if ('usage' in message && message.usage) {
          const usage = message.usage as { input_tokens?: number; output_tokens?: number };
          result.usage = {
            input: usage.input_tokens || 0,
            output: usage.output_tokens || 0,
          };
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      result.success = false;
      result.error = err.message;
      options?.onError?.(err);
    }

    return result;
  }

  /**
   * 快速探索（使用统一的 prompt 模板）
   */
  async explore(prompt: string, thoroughness: ThoroughnessLevel = 'medium'): Promise<AgentResult> {
    return this.execute('explore', buildExplorePrompt(prompt, thoroughness));
  }

  /**
   * 计划研究（使用统一的 prompt 模板）
   */
  async plan(prompt: string): Promise<AgentResult> {
    return this.execute('plan', buildPlanPrompt(prompt));
  }

  /**
   * 通用执行
   */
  async general(prompt: string): Promise<AgentResult> {
    return this.execute('general', prompt);
  }
}

/**
 * 创建 Agent 运行器
 */
export function createAgentRunner(providerManager?: {
  getActiveProvider: () => { base_url: string; api_key: string } | null;
  getMcpServersForAgent: () => Record<string, McpServerConfig>;
}): AgentRunner {
  return new AgentRunner(providerManager);
}

/**
 * 快速执行 Agent（便捷函数）
 */
export async function runAgent(
  agentName: string,
  prompt: string,
  options?: AgentExecuteOptions
): Promise<AgentResult> {
  const runner = new AgentRunner();
  return runner.execute(agentName, prompt, options);
}

/**
 * 快速探索（便捷函数）
 */
export async function runExplore(prompt: string, thoroughness: ThoroughnessLevel = 'medium'): Promise<string> {
  const runner = new AgentRunner();
  const result = await runner.explore(prompt, thoroughness);
  return result.text;
}

/**
 * 快速计划（便捷函数）
 */
export async function runPlan(prompt: string): Promise<string> {
  const runner = new AgentRunner();
  const result = await runner.plan(prompt);
  return result.text;
}

/**
 * 快速通用执行（便捷函数）
 */
export async function runGeneral(prompt: string): Promise<string> {
  const runner = new AgentRunner();
  const result = await runner.general(prompt);
  return result.text;
}
