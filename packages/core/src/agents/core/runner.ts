/**
 * Agent 运行器
 *
 * 负责执行子 Agent 并返回结果
 */

import { query, type Options, type McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import type { AgentConfig, AgentExecuteOptions, AgentResult, ThoroughnessLevel } from './types.js';
import {
  isResultMessage,
  isAssistantMessage,
  isToolProgressMessage,
  isUsageMessage,
  isTextBlock,
  isToolUseBlock,
} from './types.js';
import { getAgentConfig } from './agents.js';
import { buildExplorePrompt, buildPlanPrompt } from '../prompts/prompts.js';

// ============================================
// Provider Manager 接口
// ============================================

/**
 * 提供商信息
 */
export interface ProviderInfo {
  baseUrl: string;
  apiKey?: string;
}

/**
 * Provider Manager 接口
 *
 * 定义 Agent 运行器所需的提供商管理能力
 */
export interface ProviderManagerLike {
  /** 获取当前活跃的提供商 */
  getActiveProvider: () => ProviderInfo | null;
  /** 获取 Agent 可用的 MCP 服务器 */
  getMcpServersForAgent: () => Record<string, McpServerConfig>;
}

// ============================================
// Agent 运行器
// ============================================

/**
 * Agent 运行器
 *
 * 执行子 Agent 并管理结果
 */
export class AgentRunner {
  private providerManager: ProviderManagerLike;

  constructor(providerManager?: ProviderManagerLike) {
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
  private async executeWithConfig(
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
      envVars.ANTHROPIC_BASE_URL = provider.baseUrl;
      if (provider.apiKey) {
        envVars.ANTHROPIC_API_KEY = provider.apiKey;
      }
    }

    // 获取 MCP 服务器
    const mcpServers = this.providerManager.getMcpServersForAgent();

    // 构建选项 - 显式传递环境变量
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
        if (isResultMessage(message) && message.result) {
          const text = String(message.result);
          result.text += text;
          options?.onText?.(text);
        }

        // 处理 assistant 消息 - 提取文本内容
        if (isAssistantMessage(message)) {
          const content = message.message?.content;
          if (content && Array.isArray(content)) {
            for (const block of content) {
              // 提取文本块
              if (isTextBlock(block) && block.text) {
                result.text += block.text;
                options?.onText?.(block.text);
              }
              // 记录工具调用
              if (isToolUseBlock(block) && block.name) {
                if (!result.tools.includes(block.name)) {
                  result.tools.push(block.name);
                  options?.onTool?.(block.name, block.input);
                }
              }
            }
          }
        }

        // 处理工具调用进度
        if (isToolProgressMessage(message)) {
          const toolName = message.tool_name;
          if (!result.tools.includes(toolName)) {
            result.tools.push(toolName);
            options?.onTool?.(toolName, { tool_use_id: message.tool_use_id });
          }
        }

        // 处理 usage
        if (isUsageMessage(message)) {
          result.usage = {
            input: message.usage.input_tokens || 0,
            output: message.usage.output_tokens || 0,
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

// ============================================
// 便捷函数
// ============================================

/**
 * 创建 Agent 运行器
 */
export function createAgentRunner(providerManager?: ProviderManagerLike): AgentRunner {
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
