/**
 * 对话能力
 *
 * 提供核心对话功能
 */

import { query, type Options, type AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import type { AgentCapability, AgentContext, AgentOptions } from '../core/types.js';
import { BUILTIN_AGENTS, EXTENDED_AGENTS } from '../core/agents.js';

/**
 * 对话能力实现
 */
export class ChatCapability implements AgentCapability {
  readonly name = 'chat';
  private context!: AgentContext;

  initialize(context: AgentContext): void {
    this.context = context;
  }

  /**
   * 发送消息并返回完整响应
   */
  async send(prompt: string, options?: AgentOptions): Promise<string> {
    let result = '';
    await this.sendStream(prompt, {
      ...options,
      onText: (text) => {
        result += text;
        options?.onText?.(text);
      },
    });
    return result;
  }

  /**
   * 流式对话
   */
  async sendStream(prompt: string, options?: AgentOptions): Promise<void> {
    const provider = this.context.providerManager.getActiveProvider();
    const mcpServers = this.context.providerManager.getMcpServersForAgent();

    // 构建环境变量
    const envVars: Record<string, string | undefined> = { ...process.env };
    if (provider) {
      envVars.ANTHROPIC_BASE_URL = provider.baseUrl;
      envVars.ANTHROPIC_API_KEY = provider.apiKey;
    }

    // 构建子 Agent 配置
    const agents: Record<string, AgentDefinition> = {};

    if (options?.agents) {
      for (const name of options.agents) {
        if (name in BUILTIN_AGENTS) {
          agents[name] = BUILTIN_AGENTS[name] as AgentDefinition;
        } else if (name in EXTENDED_AGENTS) {
          agents[name] = EXTENDED_AGENTS[name] as AgentDefinition;
        }
      }
    }

    const queryOptions: Options = {
      cwd: options?.cwd,
      tools: options?.tools,
      maxTurns: options?.maxTurns,
      systemPrompt: options?.systemPrompt,
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
      agents: Object.keys(agents).length > 0 ? agents : undefined,
      env: envVars,
      permissionMode: 'bypassPermissions',
    };

    try {
      for await (const message of query({ prompt, options: queryOptions })) {
        if ('result' in message && message.result) {
          options?.onText?.(message.result as string);
        }

        // 处理工具调用
        if ('type' in message && message.type === 'tool_progress') {
          const toolMsg = message as { tool_name: string };
          options?.onTool?.(toolMsg.tool_name, undefined);
        }

        // 处理 assistant 消息中的 content blocks
        if ('message' in message && message.message && typeof message.message === 'object') {
          const msg = message.message as { content?: unknown[] };
          if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (typeof block === 'object' && block !== null) {
                const b = block as { type?: string; name?: string; input?: unknown };
                if (b.type === 'tool_use' && b.name) {
                  options?.onTool?.(b.name, b.input);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      options?.onError?.(err);
      throw err;
    }
  }
}
