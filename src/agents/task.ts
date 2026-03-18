/**
 * Task 系统 - 类似 Claude Code 的 Task Tool
 *
 * Task 是 Claude Code 的底层并行处理引擎：
 * - 临时创建子代理执行特定任务
 * - 并行执行（最多 10 个并发）
 * - 上下文隔离
 * - 继承主代理的工具
 *
 * 使用方式：
 * ```typescript
 * import { Task, createTask, runParallel } from 'claude-agent-service';
 *
 * // 方式 1: 创建 Task
 * const task = new Task({
 *   name: 'search-api',
 *   description: 'Search for API endpoints',
 *   prompt: 'Find all API endpoints in the codebase',
 * });
 * await task.run();
 *
 * // 方式 2: 并行执行多个 Task
 * const results = await runParallel([
 *   { name: 'search-api', prompt: 'Find API endpoints' },
 *   { name: 'search-db', prompt: 'Find database models' },
 * ]);
 * ```
 */

import { query, type Options, type AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import type { AgentResult, ThoroughnessLevel } from './types.js';
import { BUILTIN_AGENTS, EXTENDED_AGENTS, buildExplorePrompt } from './builtin.js';

// ============================================
// 类型定义
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
// Task 类
// ============================================

/**
 * Task - 临时子代理
 *
 * 用于执行特定任务的临时代理，类似于 Claude Code 的 Task Tool
 */
export class Task {
  private config: TaskConfig;
  private providerManager?: {
    getActiveProvider: () => { base_url: string; api_key: string } | null;
    getMcpServersForAgent: () => Record<string, string>;
  };

  constructor(config: TaskConfig, providerManager?: {
    getActiveProvider: () => { base_url: string; api_key: string } | null;
    getMcpServersForAgent: () => Record<string, string>;
  }) {
    this.config = config;
    this.providerManager = providerManager;
  }

  /**
   * 运行 Task
   */
  async run(): Promise<TaskResult> {
    const startTime = Date.now();
    const result: TaskResult = {
      name: this.config.name,
      text: '',
      tools: [],
      success: true,
      duration: 0,
    };

    // 应用提供商配置
    const provider = this.providerManager?.getActiveProvider();
    if (provider) {
      process.env.ANTHROPIC_BASE_URL = provider.base_url;
      process.env.ANTHROPIC_API_KEY = provider.api_key;
    }

    // 获取系统提示
    let systemPrompt = this.config.systemPrompt;
    let allowedTools = this.config.tools;
    let model = this.config.model;
    let maxTurns = this.config.maxTurns;

    // 如果指定了 agentType，使用该 Agent 的配置
    if (this.config.agentType) {
      const agentConfig = BUILTIN_AGENTS[this.config.agentType] || EXTENDED_AGENTS[this.config.agentType];
      if (agentConfig) {
        systemPrompt = systemPrompt || agentConfig.prompt;
        allowedTools = allowedTools || agentConfig.tools as string[];
        model = model || agentConfig.model;
        maxTurns = maxTurns || agentConfig.maxTurns;
      }
    }

    const queryOptions: Options = {
      cwd: this.config.cwd,
      allowedTools,
      maxTurns: maxTurns || 5,
      model,
      systemPrompt,
    };

    try {
      for await (const message of query({ prompt: this.config.prompt, options: queryOptions })) {
        if ('result' in message && message.result) {
          result.text += String(message.result);
        }

        if ('content' in message && Array.isArray(message.content)) {
          for (const block of message.content) {
            if (typeof block === 'object' && block !== null && 'name' in block) {
              result.tools.push((block as { name: string }).name);
            }
          }
        }

        if ('usage' in message && message.usage) {
          const usage = message.usage as { input_tokens?: number; output_tokens?: number };
          result.usage = {
            input: usage.input_tokens || 0,
            output: usage.output_tokens || 0,
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
   * 获取 Task 名称
   */
  get name(): string {
    return this.config.name;
  }

  /**
   * 获取 Task 描述
   */
  get description(): string | undefined {
    return this.config.description;
  }
}

// ============================================
// 并行执行
// ============================================

/**
 * 并行执行多个 Task
 *
 * @param tasks Task 配置数组
 * @param maxConcurrent 最大并发数（默认 10）
 */
export async function runParallel(
  tasks: ParallelTaskConfig[],
  maxConcurrent: number = 10
): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  const queue = [...tasks];
  let taskIndex = 0;

  // 生成名称
  const generateName = () => `task-${++taskIndex}`;

  // 执行一批 Task
  const executeBatch = async (batch: ParallelTaskConfig[]): Promise<TaskResult[]> => {
    return Promise.all(
      batch.map((config) => {
        const task = new Task({
          ...config,
          name: config.name || generateName(),
        });
        return task.run();
      })
    );
  };

  // 分批执行
  while (queue.length > 0) {
    const batch = queue.splice(0, maxConcurrent);
    const batchResults = await executeBatch(batch);
    results.push(...batchResults);
  }

  return results;
}

/**
 * 映射执行（类似 Promise.all 但支持并发控制）
 *
 * @param items 输入数组
 * @param fn 映射函数
 * @param maxConcurrent 最大并发数
 */
export async function mapParallel<T, R>(
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
// 便捷函数
// ============================================

/**
 * 创建 Task
 */
export function createTask(config: TaskConfig): Task {
  return new Task(config);
}

/**
 * 快速执行单个 Task
 */
export async function runTask(
  prompt: string,
  options?: Partial<TaskConfig>
): Promise<TaskResult> {
  const task = new Task({
    name: options?.name || 'quick-task',
    prompt,
    ...options,
  });
  return task.run();
}

/**
 * 快速探索 Task
 */
export async function runExploreTask(
  prompt: string,
  thoroughness: ThoroughnessLevel = 'medium'
): Promise<TaskResult> {
  const task = new Task({
    name: 'explore-task',
    prompt: buildExplorePrompt(prompt, thoroughness),
    agentType: 'explore',
  });
  return task.run();
}

/**
 * 快速研究 Task
 */
export async function runPlanTask(prompt: string): Promise<TaskResult> {
  const task = new Task({
    name: 'plan-task',
    prompt: `Research the codebase for planning:\n\n${prompt}`,
    agentType: 'plan',
  });
  return task.run();
}

/**
 * 快速通用 Task
 */
export async function runGeneralTask(prompt: string): Promise<TaskResult> {
  const task = new Task({
    name: 'general-task',
    prompt,
    agentType: 'general',
  });
  return task.run();
}
