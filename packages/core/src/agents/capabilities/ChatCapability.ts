/**
 * 对话能力
 *
 * 提供核心对话功能，支持超时控制和心跳更新
 */

import { query, type Options, type AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import type { AgentCapability, AgentContext, AgentOptions } from '../core/types.js';
import type {
  ToolBeforeHookContext,
  ToolAfterHookContext,
  AgentThinkingHookContext,
  TaskProgressHookContext,
} from '../../hooks/types.js';
import { BUILTIN_AGENTS } from '../core/agents.js';
import { TimeoutError } from '../core/types.js';

/**
 * 对话能力实现
 */
export class ChatCapability implements AgentCapability {
  readonly name = 'chat';
  private context!: AgentContext;
  private taskCounter: number = 0;

  initialize(context: AgentContext): void {
    this.context = context;
  }

  /**
   * 触发 Agent 思考过程 Hook
   */
  private async emitThinking(
    sessionId: string,
    thought: string,
    type: AgentThinkingHookContext['type'],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const hookContext: AgentThinkingHookContext = {
      sessionId,
      thought,
      type,
      timestamp: new Date(),
      metadata,
    };
    await this.context.hookRegistry.emit('agent:thinking', hookContext);
  }

  /**
   * 触发任务进度 Hook
   */
  private async emitProgress(
    sessionId: string,
    taskId: string,
    description: string,
    progress: number,
    currentStep?: string,
    totalSteps?: number
  ): Promise<void> {
    const hookContext: TaskProgressHookContext = {
      sessionId,
      taskId,
      description,
      progress,
      currentStep,
      totalSteps,
      timestamp: new Date(),
    };
    await this.context.hookRegistry.emit('task:progress', hookContext);
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
   * 流式对话（带超时控制）
   */
  async sendStream(prompt: string, options?: AgentOptions): Promise<void> {
    const provider = options?.providerId
      ? this.context.providerManager.get(options.providerId) ?? null
      : this.context.providerManager.getActiveProvider();
    const mcpServers = this.context.providerManager.getMcpServersForAgent();
    const sessionId = options?.sessionId ?? this.context.hookRegistry.getSessionId();

    if (options?.providerId && !provider) {
      throw new Error(`Provider not found: ${options.providerId}`);
    }

    // 获取超时配置
    const timeoutConfig = this.context.timeoutCap.getConfig();
    const apiTimeout = options?.apiTimeout ?? timeoutConfig.apiTimeout;

    // 创建 AbortController 用于超时控制
    const { controller, clear, timeoutPromise } = this.context.timeoutCap.createAbortController(
      apiTimeout,
      `API call timed out after ${apiTimeout}ms`
    );
    const combinedSignal = this.combineAbortSignals(controller.signal, options?.abortSignal);

    // 构建环境变量
    const envVars: Record<string, string | undefined> = { ...process.env };
    if (provider) {
      envVars.ANTHROPIC_BASE_URL = provider.baseUrl;
      envVars.ANTHROPIC_API_KEY = provider.apiKey;
    }
    if (options?.modelId || provider?.model) {
      envVars.ANTHROPIC_MODEL = options?.modelId || provider?.model;
    }

    // 构建子 Agent 配置
    const agents: Record<string, AgentDefinition> = {};

    if (options?.agents) {
      for (const name of options.agents) {
        if (name in BUILTIN_AGENTS) {
          agents[name] = BUILTIN_AGENTS[name] as AgentDefinition;
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

    if (combinedSignal) {
      (queryOptions as Options & { signal?: AbortSignal }).signal = combinedSignal;
    }

    // 追踪工具调用开始时间
    const toolStartTimes: Map<string, number> = new Map();

    // 更新活动状态（开始时）
    this.context.timeoutCap.updateActivity();

    try {
      // 使用 Promise.race 实现超时控制
      // 由于 SDK 的 query 是异步迭代器，我们需要特殊处理
      const streamPromise = this.processStream(
        prompt,
        queryOptions,
        options,
        sessionId,
        toolStartTimes,
        combinedSignal
      );

      // 竞争：流处理 vs 超时
      await Promise.race([
        streamPromise,
        timeoutPromise,
      ]);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // 如果是超时错误，触发 hook
      if (error instanceof TimeoutError) {
        await this.context.hookRegistry.emit('timeout:api', {
          sessionId,
          error: err,
          attempt: 1,
          maxAttempts: 1,
          timeout: apiTimeout,
          timestamp: new Date(),
        });
      }

      options?.onError?.(err);
      throw err;
    } finally {
      clear();
    }
  }

  /**
   * 处理流式响应（内部方法）
   */
  private async processStream(
    prompt: string,
    queryOptions: Options,
    options: AgentOptions | undefined,
    sessionId: string,
    toolStartTimes: Map<string, number>,
    abortSignal?: AbortSignal
  ): Promise<void> {
    // 生成任务 ID
    this.taskCounter++;
    const taskId = `chat-task-${this.taskCounter}`;

    // 触发初始思考
    await this.emitThinking(
      sessionId,
      `开始处理用户请求: ${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}`,
      'analyzing'
    );

    // 触发初始进度
    await this.emitProgress(sessionId, taskId, '正在准备对话', 0, '初始化', 3);

    let messageCount = 0;
    let toolCallCount = 0;

    this.throwIfAborted(abortSignal);

    for await (const message of query({ prompt, options: queryOptions })) {
      this.throwIfAborted(abortSignal);
      // 收到消息时更新活动状态（心跳）
      this.context.timeoutCap.updateActivity();
      messageCount++;

      if ('result' in message && message.result) {
        options?.onText?.(message.result as string);

        // 触发反思思考
        await this.emitThinking(
          sessionId,
          '正在生成响应',
          'reflecting',
          { messageLength: String(message.result).length }
        );
      }

      // 处理工具调用开始 (tool:before hook)
      if ('type' in message && message.type === 'tool_progress') {
        const toolMsg = message as { tool_name: string; tool_input?: unknown };
        const toolName = toolMsg.tool_name;
        const toolInput = toolMsg.tool_input as Record<string, unknown> | undefined;

        // 记录开始时间
        toolStartTimes.set(toolName, Date.now());
        toolCallCount++;

        // 触发执行思考
        await this.emitThinking(
          sessionId,
          `准备调用工具: ${toolName}`,
          'executing',
          { toolName, toolInput }
        );

        // 触发 tool:before hook
        const hookContext: ToolBeforeHookContext = {
          sessionId,
          toolName,
          input: toolInput ?? {},
          timestamp: new Date(),
        };
        await this.context.hookRegistry.emit('tool:before', hookContext);

        // 更新进度（限制最大 95%，保留 5% 给完成）
        const progress = Math.min(95, 33 + (toolCallCount * 20));
        await this.emitProgress(
          sessionId,
          taskId,
          `正在执行工具: ${toolName}`,
          progress,
          `工具调用 #${toolCallCount}`,
          3
        );

        options?.onTool?.(toolName, toolInput);
      }

      // 处理 assistant 消息中的 content blocks (tool_use 表示工具调用开始)
      if ('message' in message && message.message && typeof message.message === 'object') {
        const msg = message.message as { content?: unknown[] };
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (typeof block === 'object' && block !== null) {
              const b = block as { type?: string; name?: string; input?: unknown };
              if (b.type === 'tool_use' && b.name) {
                const toolName = b.name;
                const toolInput = b.input as Record<string, unknown> | undefined;

                // 记录开始时间
                toolStartTimes.set(toolName, Date.now());
                toolCallCount++;

                // 触发执行思考
                await this.emitThinking(
                  sessionId,
                  `准备调用工具: ${toolName}`,
                  'executing',
                  { toolName, toolInput }
                );

                // 触发 tool:before hook
                const hookContext: ToolBeforeHookContext = {
                  sessionId,
                  toolName,
                  input: toolInput ?? {},
                  timestamp: new Date(),
                };
                await this.context.hookRegistry.emit('tool:before', hookContext);

                // 更新进度（限制最大 95%，保留 5% 给完成）
                const progress = Math.min(95, 33 + (toolCallCount * 20));
                await this.emitProgress(
                  sessionId,
                  taskId,
                  `正在执行工具: ${toolName}`,
                  progress,
                  `工具调用 #${toolCallCount}`,
                  3
                );

                options?.onTool?.(toolName, toolInput);
              }
            }
          }
        }
      }

      // 处理工具结果 (tool:after hook)
      // 注意：SDK 流中工具结果可能以不同形式出现
      // 当检测到 result 消息时，触发已完成工具的 after hook
      if ('result' in message && message.result) {
        // 对所有追踪中的工具触发 after hook
        for (const [toolName, startTime] of toolStartTimes) {
          const duration = Date.now() - startTime;

          // 触发反思思考
          await this.emitThinking(
            sessionId,
            `工具 ${toolName} 执行完成，耗时 ${duration}ms`,
            'reflecting',
            { toolName, duration }
          );

          const hookContext: ToolAfterHookContext = {
            sessionId,
            toolName,
            input: {},
            output: message.result,
            success: true,
            duration,
            timestamp: new Date(),
          };
          await this.context.hookRegistry.emit('tool:after', hookContext);
        }
        toolStartTimes.clear();
      }
    }

    // 触发完成进度
    await this.emitProgress(sessionId, taskId, '对话完成', 100, '完成', 3);
  }

  private combineAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
    const activeSignals = signals.filter((signal): signal is AbortSignal => signal !== undefined);
    if (activeSignals.length === 0) {
      return undefined;
    }
    if (activeSignals.length === 1) {
      return activeSignals[0];
    }

    const controller = new AbortController();
    const abort = () => {
      if (!controller.signal.aborted) {
        controller.abort();
      }
    };

    for (const signal of activeSignals) {
      if (signal.aborted) {
        abort();
        break;
      }
      signal.addEventListener('abort', abort, { once: true });
    }

    return controller.signal;
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    const error = new Error('Request aborted');
    error.name = 'AbortError';
    throw error;
  }
}
