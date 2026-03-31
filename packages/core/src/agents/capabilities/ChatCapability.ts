/**
 * 对话能力
 *
 * 提供核心对话功能，支持超时控制和心跳更新。
 * 内部使用 LLMRuntime (Vercel AI SDK) 替代 claude-agent-sdk。
 */

import type { AgentCapability, AgentContext, AgentOptions } from '../core/types.js';
import type {
  ToolBeforeHookContext,
  ToolAfterHookContext,
  AgentThinkingHookContext,
  TaskProgressHookContext,
} from '../../hooks/types.js';
import { TimeoutError } from '../core/types.js';
import { LLMRuntime } from '../runtime/LLMRuntime.js';
import type { RuntimeConfig } from '../runtime/types.js';

/**
 * 对话能力实现
 */
export class ChatCapability implements AgentCapability {
  readonly name = 'chat';
  private context!: AgentContext;
  private runtime!: LLMRuntime;
  private taskCounter: number = 0;

  initialize(context: AgentContext): void {
    this.context = context;
    this.runtime = new LLMRuntime(context.providerManager);
  }

  /**
   * 触发 Agent 思考过程 Hook
   */
  private async emitThinking(
    sessionId: string,
    thought: string,
    type: AgentThinkingHookContext['type'],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    console.log(`[agent] ${type}: ${thought}`)
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
    totalSteps?: number,
  ): Promise<void> {
    console.debug(`[agent] ${description} (${progress}%)`)
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
   * 发送消息并返回完整响应（带超时控制）
   */
  async send(prompt: string, options?: AgentOptions): Promise<string> {
    let result = '';
    const originalOnText = options?.onText;

    const sessionId = options?.sessionId ?? this.context.hookRegistry.getSessionId();

    // 获取超时配置
    const timeoutConfig = this.context.timeoutCap.getConfig();
    const apiTimeout = options?.apiTimeout ?? timeoutConfig.apiTimeout;

    // 创建 AbortController 用于超时控制
    const { controller, clear, timeoutPromise } = this.context.timeoutCap.createAbortController(
      apiTimeout,
      `API call timed out after ${apiTimeout}ms`,
    );
    const combinedSignal = this.combineAbortSignals(controller.signal, options?.abortSignal);

    // 生成任务 ID
    this.taskCounter++;
    const taskId = `chat-task-${this.taskCounter}`;
    let toolCallCount = 0;

    // 构建 RuntimeConfig
    // AI SDK 不允许同时传 prompt 和 messages，有历史时追加当前消息到 messages
    const history = options?.messages;
    const runtimeConfig: RuntimeConfig = {
      system: options?.systemPrompt,
      messages: history && history.length > 0
        ? [...history, { role: 'user', content: prompt }]
        : undefined,
      prompt: (!history || history.length === 0) ? prompt : undefined,
      providerId: options?.providerId,
      model: options?.modelId,
      maxSteps: options?.maxTurns,
      streaming: true,
      abortSignal: combinedSignal,
      onText: (text: string) => {
        result += text;
        originalOnText?.(text);
      },
      onToolCall: (toolName, input) => {
        toolCallCount++;
        this.handleToolUse(toolName, input, sessionId, taskId, toolCallCount, options);
      },
      onToolResult: (toolName, toolOutput) => {
        this.handleToolResult(toolName, toolOutput, sessionId);
      },
      onReasoning: (text) => {
        this.emitThinking(sessionId, text, 'reflecting');
      },
    };

    // 更新活动状态（开始时）
    this.context.timeoutCap.updateActivity();

    // 触发初始思考
    await this.emitThinking(
      sessionId,
      `开始处理用户请求: ${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}`,
      'analyzing',
    );
    await this.emitProgress(sessionId, taskId, '正在准备对话', 0, '初始化', 3);

    try {
      // 竞争：流处理 vs 超时
      const runtimeResult = await Promise.race([
        this.runtime.run(runtimeConfig),
        timeoutPromise,
      ]);

      if (!runtimeResult.success && runtimeResult.error) {
        options?.onError?.(new Error(runtimeResult.error));
        throw new Error(runtimeResult.error);
      }

      // 触发完成进度
      await this.emitProgress(sessionId, taskId, '对话完成', 100, '完成', 3);

      return result;
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
   * 处理工具调用事件（触发 tool:before hook）
   */
  private async handleToolUse(
    toolName: string,
    rawInput: unknown,
    sessionId: string,
    taskId: string,
    toolCallIndex: number,
    options: AgentOptions | undefined,
  ): Promise<void> {
    const toolInput = rawInput as Record<string, unknown> | undefined;

    await this.emitThinking(sessionId, `准备调用工具: ${toolName}`, 'executing', { toolName, toolInput });

    const hookContext: ToolBeforeHookContext = {
      sessionId,
      toolName,
      input: toolInput ?? {},
      timestamp: new Date(),
    };
    await this.context.hookRegistry.emit('tool:before', hookContext);

    const progress = Math.min(95, 33 + (toolCallIndex * 20));
    await this.emitProgress(sessionId, taskId, `正在执行工具: ${toolName}`, progress, `工具调用 #${toolCallIndex}`, 3);

    options?.onTool?.(toolName, toolInput);
  }

  /**
   * 处理工具结果事件（触发 tool:after hook）
   */
  private async handleToolResult(
    toolName: string,
    output: unknown,
    sessionId: string,
  ): Promise<void> {
    await this.emitThinking(sessionId, `工具 ${toolName} 执行完成`, 'reflecting', { toolName });

    const hookContext: ToolAfterHookContext = {
      sessionId,
      toolName,
      input: {},
      output,
      success: true,
      duration: 0,
      timestamp: new Date(),
    };
    await this.context.hookRegistry.emit('tool:after', hookContext);

    // 收到工具结果时更新活动状态（心跳）
    this.context.timeoutCap.updateActivity();
  }

  private combineAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
    const activeSignals = signals.filter((signal): signal is AbortSignal => signal !== undefined);
    if (activeSignals.length === 0) return undefined;
    if (activeSignals.length === 1) return activeSignals[0];

    // AbortSignal.any() (Node 20+) — 自动清理监听器，无泄漏
    return AbortSignal.any(activeSignals);
  }
}
