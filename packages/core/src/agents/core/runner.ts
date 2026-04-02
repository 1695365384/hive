/**
 * Agent 运行器
 *
 * 统一的 Agent 执行引擎：子 Agent 执行 + 并行任务
 * 内部委托给 LLMRuntime（Vercel AI SDK）
 */

import { createProviderManager } from '../../providers/ProviderManager.js';
import type { ProviderManager } from '../../providers/ProviderManager.js';
import type { AgentConfig, AgentExecuteOptions, AgentResult, ThoroughnessLevel } from './types.js';
import type { RuntimeConfig, RuntimeResult } from '../runtime/types.js';
import { LLMRuntime, AGENT_PRESETS } from '../runtime/LLMRuntime.js';
import { getAgentConfig } from './agents.js';
import { buildExplorePrompt } from '../prompts/prompts.js';
import { ToolRegistry, type AgentType as ToolAgentType } from '../../tools/tool-registry.js';
import { createDynamicPromptBuilder } from '../pipeline/DynamicPromptBuilder.js';
import type { AgentType } from '../types/capabilities.js';
import type { EnvironmentContext } from '../../environment/types.js';

// ============================================
// Task 类型定义
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
 * 内部使用 LLMRuntime，提供向后兼容的 API
 */
export class AgentRunner {
  private runtime: LLMRuntime;
  private toolRegistry: ToolRegistry;
  private _environmentContext?: EnvironmentContext;

  constructor(providerManager?: ProviderManager) {
    if (providerManager) {
      this.runtime = new LLMRuntime(providerManager);
    } else {
      this.runtime = new LLMRuntime(createProviderManager({ useEnvFallback: true }));
    }
    this.toolRegistry = new ToolRegistry();
    this.toolRegistry.registerBuiltInTools();
  }

  /** 注入环境上下文（fork 模型：Worker 继承父 Agent 的环境知识） */
  setEnvironmentContext(env: EnvironmentContext): void {
    this._environmentContext = env;
  }

  getEnvironmentContext(): EnvironmentContext | undefined {
    return this._environmentContext;
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
    options?: AgentExecuteOptions,
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
   * 以流式模式执行 Agent（Worker 使用）
   *
   * 与 execute() 的区别：使用 streaming: true，通过回调透传事件。
   * 返回最终文本结果，事件通过 callbacks 实时推送。
   */
  async executeStreaming(
    agentName: string,
    prompt: string,
    callbacks: {
      onText?: (text: string) => void;
      onToolCall?: (toolName: string, input?: unknown) => void;
      onToolResult?: (toolName: string, output?: unknown) => void;
      onReasoning?: (text: string) => void;
    },
    options?: AgentExecuteOptions,
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

    const preset = AGENT_PRESETS[agentConfig.type];

    // Build system prompt: fork 模型 — 继承父 Agent 的环境知识
    let system = options?.systemPrompt;
    if (!system) {
      const builder = createDynamicPromptBuilder();
      const toolDescs = this.toolRegistry.getToolDescriptions(agentConfig.type as ToolAgentType);
      system = builder.buildPrompt({
        task: '',
        priorResults: [],
        agentType: agentConfig.type as AgentType,
        environmentContext: this._environmentContext,
        toolDescriptions: toolDescs,
      });
    }

    const runtimeConfig: RuntimeConfig = {
      prompt,
      system,
      messages: options?.messages,
      model: options?.model || agentConfig.model || preset?.model,
      maxSteps: options?.maxTurns || agentConfig.maxTurns || preset?.maxSteps || 10,
      streaming: true,
      tools: this.toolRegistry.getToolsForAgent(agentConfig.type as ToolAgentType),
      onText: callbacks.onText,
      onToolCall: callbacks.onToolCall,
    };

    if (options?.timeout) {
      const controller = new AbortController();
      runtimeConfig.abortSignal = controller.signal;

      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`Worker timed out after ${options.timeout}ms`));
        }, options.timeout);
      });

      try {
        const result = await Promise.race([
          this.runtime.run(runtimeConfig),
          timeoutPromise,
        ]);
        return this.mapToAgentResult(result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        return { text: '', tools: [], success: false, error: err.message };
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }

    const result = await this.runtime.run(runtimeConfig);
    return this.mapToAgentResult(result);
  }

  /**
   * 使用配置执行 Agent
   */
  private async executeWithConfig(
    config: AgentConfig,
    prompt: string,
    options?: AgentExecuteOptions,
  ): Promise<AgentResult> {
    console.log(`[agent] Executing ${config.type} agent: ${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}`)
    const preset = AGENT_PRESETS[config.type];

    // Dynamically inject tool descriptions into system prompt
    const baseSystem = options?.systemPrompt || config.prompt || preset?.system;
    const toolDescs = this.toolRegistry.getToolDescriptions(config.type as ToolAgentType);
    let system = baseSystem;
    if (toolDescs.length > 0) {
      const toolSection = '## Your Tools\n\n' + toolDescs.map(t => `- **${t.name}**: ${t.description}`).join('\n');
      system = baseSystem ? baseSystem + '\n\n' + toolSection : toolSection;
    }

    const runtimeConfig: RuntimeConfig = {
      prompt,
      system,
      messages: options?.messages,
      model: options?.model || config.model || preset?.model,
      maxSteps: options?.maxTurns || config.maxTurns || preset?.maxSteps || 10,
      streaming: false,
      tools: this.toolRegistry.getToolsForAgent(config.type as ToolAgentType),
      onText: options?.onText,
      onToolCall: options?.onTool,
    };

    if (options?.timeout) {
      const controller = new AbortController();
      runtimeConfig.abortSignal = controller.signal;

      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`Sub-agent timed out after ${options.timeout}ms`));
        }, options.timeout);
      });

      try {
        const result = await Promise.race([
          this.runtime.run(runtimeConfig),
          timeoutPromise,
        ]);
        if (!result.success) {
          console.error(`[agent] ${config.type} agent failed: ${result.error}`)
          options?.onError?.(new Error(result.error));
        }
        return this.mapToAgentResult(result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`[agent] ${config.type} agent error: ${err.message}`)
        if (options?.onError) {
          options.onError(err);
        }
        return { text: '', tools: [], success: false, error: err.message };
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }

    const result = await this.runtime.run(runtimeConfig);
    if (!result.success && options?.onError) {
      console.error(`[agent] ${config.type} agent failed: ${result.error}`)
      options.onError(new Error(result.error));
    }
    return this.mapToAgentResult(result);
  }

  /**
   * 将 RuntimeResult 映射为 AgentResult（usage 字段名适配）
   */
  private mapToAgentResult(result: RuntimeResult): AgentResult {
    return {
      text: result.text,
      tools: result.tools,
      usage: result.usage
        ? { input: result.usage.promptTokens, output: result.usage.completionTokens }
        : undefined,
      success: result.success,
      error: result.error,
    };
  }

  // ============================================
  // Task 执行
  // ============================================

  /**
   * 执行单个 Task
   */
  async runTask(config: TaskConfig): Promise<TaskResult> {
    const startTime = Date.now();
    console.log(`[agent] Task "${config.name}" started: ${config.prompt.slice(0, 80)}${config.prompt.length > 80 ? '...' : ''}`)

    // 如果指定了 agentType，使用预设配置
    let systemPrompt = config.systemPrompt;
    let model = config.model;
    let maxSteps = config.maxTurns || 5;

    if (config.agentType) {
      const agentConfig = getAgentConfig(config.agentType);
      if (agentConfig) {
        systemPrompt = systemPrompt || agentConfig.prompt;
        model = model || agentConfig.model;
        maxSteps = maxSteps || agentConfig.maxTurns || 5;
      }
    }

    const preset = config.agentType ? AGENT_PRESETS[config.agentType] : undefined;

    const result = await this.runtime.run({
      prompt: config.prompt,
      system: systemPrompt || preset?.system,
      model: model || preset?.model,
      maxSteps,
      streaming: false,
      tools: this.toolRegistry.getToolsForAgent((config.agentType || 'general') as ToolAgentType),
    });

    if (!result.success) {
      console.error(`[agent] Task "${config.name}" failed: ${result.error}`)
    }
    return {
      name: config.name,
      text: result.text,
      tools: result.tools,
      usage: result.usage
        ? { input: result.usage.promptTokens, output: result.usage.completionTokens }
        : undefined,
      success: result.success,
      error: result.error,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 并行执行多个 Task
   */
  async runParallel(
    tasks: ParallelTaskConfig[],
    maxConcurrent: number = 10,
  ): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    const queue = [...tasks];
    let taskIndex = 0;

    const generateName = () => `task-${++taskIndex}`;

    while (queue.length > 0) {
      const batch = queue.splice(0, maxConcurrent);
      const batchResults = await Promise.all(
        batch.map((config) =>
          this.runTask({
            ...config,
            name: config.name || generateName(),
          }),
        ),
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 获取工具注册表（用于注册自定义工具或 Memory 工具）
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * 映射执行（并发控制）
   */
  async mapParallel<T, R>(
    items: T[],
    fn: (item: T, index: number) => Promise<R>,
    maxConcurrent: number = 10,
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
   * 快速探索
   */
  async explore(prompt: string, thoroughness: ThoroughnessLevel = 'medium'): Promise<AgentResult> {
    return this.execute('explore', buildExplorePrompt(prompt, thoroughness));
  }

  /**
   * 快速执行单个 Task
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

}

// ============================================
// 工厂函数
// ============================================

/**
 * 创建 Agent 运行器
 */
export function createAgentRunner(providerManager?: ProviderManager): AgentRunner {
  return new AgentRunner(providerManager);
}

// Re-export for lightweight import path (avoids barrel loading storage/SQLite)
export { createProviderManager } from '../../providers/ProviderManager.js';
