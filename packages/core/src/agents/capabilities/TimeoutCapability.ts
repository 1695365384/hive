/**
 * 超时能力
 *
 * 提供超时控制、心跳检测和活动状态管理
 */

import type { AgentCapability, AgentContext } from '../core/types.js';
import type { TimeoutConfig, HeartbeatConfig, TimeoutError as TimeoutErrorType } from '../core/types.js';
import { TimeoutError } from '../core/types.js';

/**
 * 超时控制器结果
 */
interface TimeoutControllerResult {
  /** AbortController 用于中断请求 */
  controller: AbortController;
  /** 清除超时计时器 */
  clear: () => void;
  /** 超时 Promise（用于竞争） */
  timeoutPromise: Promise<never>;
}

/**
 * 心跳状态
 */
interface HeartbeatState {
  /** 最后活动时间戳 */
  lastActivity: number;
  /** 心跳定时器 ID */
  heartbeatTimer?: ReturnType<typeof setInterval>;
  /** 卡住检测定时器 ID */
  stallTimer?: ReturnType<typeof setInterval>;
  /** 是否正在运行 */
  running: boolean;
  /** 配置 */
  config: HeartbeatConfig;
  /** AbortController 用于 abort action */
  abortController?: AbortController;
}

/**
 * 默认超时配置
 */
const DEFAULT_TIMEOUT_CONFIG: Required<TimeoutConfig> = {
  apiTimeout: 120000, // 2 分钟
  executionTimeout: 600000, // 10 分钟
  heartbeatInterval: 30000, // 30 秒
  stallTimeout: 120000, // 2 分钟
  retryOnTimeout: false,
  maxRetries: 0,
};

/**
 * 超时能力实现
 *
 * 提供：
 * - API 调用超时控制
 * - 整体执行超时控制
 * - 心跳检测
 * - 卡住检测（长时间无活动）
 */
export class TimeoutCapability implements AgentCapability {
  readonly name = 'timeout';

  private context!: AgentContext;
  private config: Required<TimeoutConfig>;
  private heartbeatState: HeartbeatState | null = null;

  constructor(config?: TimeoutConfig) {
    this.config = { ...DEFAULT_TIMEOUT_CONFIG, ...config };
  }

  initialize(context: AgentContext): void {
    this.context = context;
  }

  dispose(): void {
    this.stopHeartbeat();
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<TimeoutConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): Required<TimeoutConfig> {
    return { ...this.config };
  }

  // ============================================
  // 超时控制
  // ============================================

  /**
   * 创建带超时的 AbortController
   *
   * @param timeout - 超时时间（毫秒）
   * @param message - 超时错误消息
   * @returns 控制器、清除函数和超时 Promise
   */
  createAbortController(
    timeout: number,
    message?: string
  ): TimeoutControllerResult {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new TimeoutError(
          message ?? `Operation timed out after ${timeout}ms`,
          'api',
          timeout
        );
        controller.abort(error);
        reject(error);
      }, timeout);
    });

    const clear = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    return { controller, clear, timeoutPromise };
  }

  /**
   * 为 Promise 添加超时
   *
   * @param promise - 原始 Promise
   * @param timeout - 超时时间（毫秒）
   * @param message - 超时错误消息
   * @returns 带超时的 Promise
   */
  async withTimeout<T>(
    promise: Promise<T>,
    timeout: number,
    message?: string
  ): Promise<T> {
    const { controller, clear, timeoutPromise } = this.createAbortController(
      timeout,
      message
    );

    try {
      // 使用 Promise.race 实现超时
      const result = await Promise.race([
        promise,
        timeoutPromise,
      ]);
      return result;
    } finally {
      clear();
    }
  }

  /**
   * 为 Promise 添加超时和重试
   *
   * @param fn - 要执行的异步函数
   * @param timeout - 超时时间（毫秒）
   * @param message - 超时错误消息
   * @returns 执行结果
   */
  async withTimeoutAndRetry<T>(
    fn: () => Promise<T>,
    timeout: number,
    message?: string
  ): Promise<T> {
    const maxAttempts = this.config.retryOnTimeout
      ? (this.config.maxRetries ?? 0) + 1
      : 1;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.withTimeout(fn(), timeout, message);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 如果不是超时错误，直接抛出
        if (!(error instanceof TimeoutError)) {
          throw error;
        }

        // 触发超时 hook
        await this.context.hookRegistry.emit('timeout:api', {
          sessionId: this.context.hookRegistry.getSessionId(),
          error: lastError,
          attempt,
          maxAttempts,
          timeout,
          timestamp: new Date(),
        });

        // 如果还有重试机会，继续
        if (attempt < maxAttempts) {
          // 等待一小段时间再重试（指数退避）
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError;
  }

  // ============================================
  // 执行超时
  // ============================================

  /**
   * 启动执行超时计时器
   *
   * @param timeout - 超时时间（毫秒）
   * @param onTimeout - 超时回调
   * @returns 清除函数
   */
  startExecutionTimer(
    timeout: number,
    onTimeout: () => void
  ): () => void {
    const timerId = setTimeout(async () => {
      // 触发执行超时 hook
      await this.context.hookRegistry.emit('timeout:execution', {
        sessionId: this.context.hookRegistry.getSessionId(),
        timeout,
        timestamp: new Date(),
      });

      onTimeout();
    }, timeout);

    return () => clearTimeout(timerId);
  }

  // ============================================
  // 心跳检测
  // ============================================

  /**
   * 启动心跳检测
   *
   * @param config - 心跳配置
   * @param abortController - 可选的 AbortController，用于 abort action
   */
  startHeartbeat(config: HeartbeatConfig, abortController?: AbortController): void {
    // 停止现有的心跳
    this.stopHeartbeat();

    this.heartbeatState = {
      lastActivity: Date.now(),
      running: true,
      config,
      abortController,
    };

    // 启动心跳定时器
    this.heartbeatState.heartbeatTimer = setInterval(async () => {
      if (!this.heartbeatState?.running) return;

      const now = Date.now();
      const lastActivity = this.heartbeatState.lastActivity;

      // 触发心跳 hook
      await this.context.hookRegistry.emit('health:heartbeat', {
        sessionId: this.context.hookRegistry.getSessionId(),
        lastActivity,
        timeSinceLastActivity: now - lastActivity,
        timestamp: new Date(),
      });

      config.onHeartbeat?.(lastActivity);
    }, config.interval);

    // 启动卡住检测定时器
    this.heartbeatState.stallTimer = setInterval(async () => {
      if (!this.heartbeatState?.running) return;

      const now = Date.now();
      const timeSinceLastActivity = now - this.heartbeatState.lastActivity;

      if (timeSinceLastActivity > config.stallTimeout) {
        // 触发卡住检测 hook
        await this.context.hookRegistry.emit('timeout:stalled', {
          sessionId: this.context.hookRegistry.getSessionId(),
          lastActivity: this.heartbeatState.lastActivity,
          stallDuration: timeSinceLastActivity,
          stallTimeout: config.stallTimeout,
          timestamp: new Date(),
        });

        config.onStalled?.(this.heartbeatState.lastActivity);

        // abort action: 中断正在执行的 Promise
        if (config.action === 'abort' && this.heartbeatState.abortController) {
          this.heartbeatState.abortController.abort(
            new TimeoutError(
              `Agent stalled for ${timeSinceLastActivity}ms (timeout: ${config.stallTimeout}ms)`,
              'stalled',
              config.stallTimeout
            )
          );
        }
      }
    }, config.stallTimeout);
  }

  /**
   * 停止心跳检测
   */
  stopHeartbeat(): void {
    if (this.heartbeatState) {
      this.heartbeatState.running = false;

      if (this.heartbeatState.heartbeatTimer) {
        clearInterval(this.heartbeatState.heartbeatTimer);
      }
      if (this.heartbeatState.stallTimer) {
        clearInterval(this.heartbeatState.stallTimer);
      }

      this.heartbeatState = null;
    }
  }

  /**
   * 更新活动状态
   *
   * 在收到 LLM 消息、工具调用等事件时调用
   */
  updateActivity(): void {
    if (this.heartbeatState) {
      this.heartbeatState.lastActivity = Date.now();
    }
  }

  /**
   * 检查是否卡住
   */
  isStalled(): boolean {
    if (!this.heartbeatState) {
      return false;
    }

    const timeSinceLastActivity = Date.now() - this.heartbeatState.lastActivity;
    return timeSinceLastActivity > this.heartbeatState.config.stallTimeout;
  }

  /**
   * 获取最后活动时间
   */
  getLastActivity(): number | null {
    return this.heartbeatState?.lastActivity ?? null;
  }

  /**
   * 检查心跳是否正在运行
   */
  isHeartbeatRunning(): boolean {
    return this.heartbeatState?.running ?? false;
  }
}

/**
 * 创建超时能力实例
 */
export function createTimeoutCapability(config?: TimeoutConfig): TimeoutCapability {
  return new TimeoutCapability(config);
}
