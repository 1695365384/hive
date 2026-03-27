/**
 * Agent 运行器
 *
 * 统一的 Agent 执行引擎：子 Agent 执行 + 并行任务
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
// Task 类型定义（从 task.ts 合并）
// ============================================

/**
 * Task 配置
 */
export interface TaskConfig {
  /** Task 名称 */
  name: string;
  /** 描述 */
  description?: string;
  /** Task prompt */
  prompt: string;
  /** 使用的模型 */
  model?: string;
  /** 允许的工具 */
  tools?: string[];
  /** 最大轮次 */
  maxTurns?: number;
  /** 工作目录 */
  cwd?: string;
  /** 自定义系统提示 */
  systemPrompt?: string;
  /** 基于现有 Agent 创建 */
  agentType?: string;
}

/**
 * Task 执行结果
 */
export interface TaskResult extends AgentResult {
  /** Task 名称 */
  name: string;
  /** 执行时间（毫秒） */
  duration: number;
}

/**
 * 并行 Task 配置
 */
export interface ParallelTaskConfig extends Omit<TaskConfig, 'name'> {
  /** Task 名称（可选，自动生成） */
  name?: string;
}

// ============================================
// Agent 运行器
// ============================================

/**
 * Agent 运行器
 *
 * 统一的执行引擎：子 Agent 执行 + 并行任务
 */
export class AgentRunner {
  private providerManager: ProviderManagerLike;

  constructor(providerManager?: ProviderManagerLike) {
    this.providerManager = providerManager || {
      getActiveProvider: () => null,
      getMcpServersForAgent: () => ({}),
    };
  }

  // ============================================
  // 子 Agent 执行
  // ============================================

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

    const queryOptions = this.buildQueryOptions(config, options);

    try {
      const timeout = options?.timeout;

      if (timeout) {
        const controller = new AbortController();
        (queryOptions as Options & { signal?: AbortSignal }).signal = controller.signal;

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => {
            controller.abort();
            reject(new Error(`Sub-agent timed out after ${timeout}ms`));
          }, timeout)
        );

        await Promise.race([
          this.executeQuery(prompt, queryOptions, result, options),
          timeoutPromise,
        ]);
      } else {
        await this.executeQuery(prompt, queryOptions, result, options);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      result.success = false;
      result.error = err.message;
      options?.onError?.(err);
    }

    return result;
  }

  // ============================================
  // Task 执行（从 task.ts 合并）
  // ============================================

  /**
   * 执行单个 Task
   */
  async runTask(config: TaskConfig): Promise<TaskResult> {
    const startTime = Date.now();
    const result: TaskResult = {
      name: config.name,
      text: '',
      tools: [],
      success: true,
      duration: 0,
    };

    // 获取系统提示和工具配置
    let systemPrompt = config.systemPrompt;
    let allowedTools = config.tools;
    let model = config.model;
    let maxTurns = config.maxTurns;

    // 如果指定了 agentType，使用该 Agent 的配置
    if (config.agentType) {
      const agentConfig = getAgentConfig(config.agentType);
      if (agentConfig) {
        systemPrompt = systemPrompt || agentConfig.prompt;
        allowedTools = allowedTools || agentConfig.tools as string[];
        model = model || agentConfig.model;
        maxTurns = maxTurns || agentConfig.maxTurns;
      }
    }

    // 构建环境变量
    const provider = this.providerManager.getActiveProvider();
    const envVars: Record<string, string | undefined> = { ...process.env };
    if (provider) {
      envVars.ANTHROPIC_BASE_URL = provider.baseUrl;
      if (provider.apiKey) {
        envVars.ANTHROPIC_API_KEY = provider.apiKey;
      }
    }

    const queryOptions: Options = {
      cwd: config.cwd,
      tools: allowedTools,
      maxTurns: maxTurns || 5,
      model,
      systemPrompt,
      env: envVars,
      permissionMode: 'bypassPermissions',
    };

    try {
      for await (const message of query({ prompt: config.prompt, options: queryOptions })) {
        if (isResultMessage(message) && message.result) {
          result.text += String(message.result);
        }

        if (isAssistantMessage(message)) {
          const content = message.message?.content;
          if (content && Array.isArray(content)) {
            for (const block of content) {
              if (isToolUseBlock(block) && block.name) {
                if (!result.tools.includes(block.name)) {
                  result.tools.push(block.name);
                }
              }
            }
          }
        }

        if (isUsageMessage(message)) {
          result.usage = {
            input: message.usage.input_tokens || 0,
            output: message.usage.output_tokens || 0,
          };
        }
      }
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : String(error);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * 并行执行多个 Task
   */
  async runParallel(
    tasks: ParallelTaskConfig[],
    maxConcurrent: number = 10
  ): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    const queue = [...tasks];
    let taskIndex = 0;

    const generateName = () => `task-${++taskIndex}`;

    const executeBatch = async (batch: ParallelTaskConfig[]): Promise<TaskResult[]> => {
      return Promise.all(
        batch.map((config) => {
          const taskConfig: TaskConfig = {
            ...config,
            name: config.name || generateName(),
          };
          return this.runTask(taskConfig);
        })
      );
    };

    while (queue.length > 0) {
      const batch = queue.splice(0, maxConcurrent);
      const batchResults = await executeBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 映射执行（类似 Promise.all 但支持并发控制）
   */
  async mapParallel<T, R>(
    items: T[],
    fn: (item: T, index: number) => Promise<R>,
    maxConcurrent: number = 10
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let currentIndex = 0;

    const worker = async () => {
      while (currentIndex < items.length) {
        const index = currentIndex++;
        results[index] = await fn(items[index], index);
      }
    };

    const workers = Array(Math.min(maxConcurrent, items.length))
      .fill(null)
      .map(() => worker());

    await Promise.all(workers);
    return results;
  }

  // ============================================
  // 便捷方法
  // ============================================

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

  /**
   * 快速执行单个 Task（便捷方法）
   */
  async quickTask(prompt: string, options?: Partial<TaskConfig>): Promise<TaskResult> {
    return this.runTask({
      name: options?.name || 'quick-task',
      prompt,
      ...options,
    });
  }

  /**
   * 快速探索 Task
   */
  async exploreTask(prompt: string, thoroughness: ThoroughnessLevel = 'medium'): Promise<TaskResult> {
    return this.runTask({
      name: 'explore-task',
      prompt: buildExplorePrompt(prompt, thoroughness),
      agentType: 'explore',
    });
  }

  /**
   * 快速研究 Task
   */
  async planTask(prompt: string): Promise<TaskResult> {
    return this.runTask({
      name: 'plan-task',
      prompt: `Research the codebase for planning:\n\n${prompt}`,
      agentType: 'plan',
    });
  }

  /**
   * 快速通用 Task
   */
  async generalTask(prompt: string): Promise<TaskResult> {
    return this.runTask({
      name: 'general-task',
      prompt,
      agentType: 'general',
    });
  }

  // ============================================
  // 内部方法
  // ============================================

  /**
   * 构建 query 选项（子 Agent 用）
   */
  private buildQueryOptions(
    config: AgentConfig,
    options?: AgentExecuteOptions
  ): Options {
    const provider = this.providerManager.getActiveProvider();
    const mcpServers = this.providerManager.getMcpServersForAgent();

    const envVars: Record<string, string | undefined> = { ...process.env };
    if (provider) {
      envVars.ANTHROPIC_BASE_URL = provider.baseUrl;
      if (provider.apiKey) {
        envVars.ANTHROPIC_API_KEY = provider.apiKey;
      }
    }

    return {
      cwd: options?.cwd,
      tools: config.tools || options?.allowedTools,
      maxTurns: config.maxTurns || options?.maxTurns || 10,
      model: config.model || options?.model,
      systemPrompt: config.prompt,
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
      permissionMode: options?.permissionMode || 'bypassPermissions',
      env: envVars,
    };
  }

  /**
   * 执行查询并处理消息流
   */
  private async executeQuery(
    prompt: string,
    queryOptions: Options,
    result: AgentResult,
    options?: AgentExecuteOptions
  ): Promise<void> {
    for await (const message of query({ prompt, options: queryOptions })) {
      // 处理 assistant 消息 - 提取文本内容（流式）
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

      // 处理最终结果 - 仅作为 fallback（assistant 消息通常已包含文本）
      if (isResultMessage(message) && message.result) {
        if (!result.text) {
          const text = String(message.result);
          result.text = text;
          options?.onText?.(text);
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
  }
}

// ============================================
// 工厂函数
// ============================================

/**
 * 创建 Agent 运行器
 */
export function createAgentRunner(providerManager?: ProviderManagerLike): AgentRunner {
  return new AgentRunner(providerManager);
}
