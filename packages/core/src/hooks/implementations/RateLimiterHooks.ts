/**
 * 限流熔断 Hooks
 *
 * 提供：
 * - 限流（Rate Limiting）
 * - 熔断器（Circuit Breaker）
 * - 令牌桶算法
 * - 滑动窗口计数
 */

import {
  type HookRegistry,
  type HookPriority,
  type SessionStartHookContext,
  type SessionErrorHookContext,
  type ToolBeforeHookContext,
  type HookResult,
  type ToolBeforeHookModifiedContext,
} from '../index.js';

/**
 * 限流配置
 */
export interface RateLimitConfig {
  /** 时间窗口（毫秒） */
  windowMs: number;
  /** 窗口内最大请求数 */
  maxRequests: number;
  /** 错误消息 */
  errorMessage?: string;
}

/**
 * 熔断器状态
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * 熔断器配置
 */
export interface CircuitBreakerConfig {
  /** 失败阈值（触发熔断的连续失败次数） */
  failureThreshold: number;
  /** 成功阈值（半开状态下恢复需要的连续成功次数） */
  successThreshold: number;
  /** 熔断持续时间（毫秒） */
  timeout: number;
  /** 错误消息 */
  errorMessage?: string;
}

/**
 * 限流统计
 */
interface RateLimitStats {
  /** 请求时间戳列表 */
  timestamps: number[];
  /** 最后清理时间 */
  lastCleanup: number;
}

/**
 * 熔断器统计
 */
interface CircuitBreakerStats {
  /** 当前状态 */
  state: CircuitState;
  /** 连续失败次数 */
  consecutiveFailures: number;
  /** 连续成功次数 */
  consecutiveSuccesses: number;
  /** 熔断开始时间 */
  openedAt: number | null;
  /** 总失败次数 */
  totalFailures: number;
  /** 总成功次数 */
  totalSuccesses: number;
}

/**
 * 限流熔断配置
 */
export interface RateLimiterHooksConfig {
  /** 会话级限流配置 */
  sessionRateLimit?: RateLimitConfig;
  /** 工具级限流配置（按工具名称） */
  toolRateLimits?: Map<string, RateLimitConfig>;
  /** 全局限流配置 */
  globalRateLimit?: RateLimitConfig;
  /** 熔断器配置 */
  circuitBreaker?: CircuitBreakerConfig;
  /** 限流触发回调 */
  onRateLimited?: (context: { type: 'session' | 'tool' | 'global'; key: string; retryAfter: number }) => void;
  /** 熔断触发回调 */
  onCircuitOpen?: () => void;
  /** 熔断恢复回调 */
  onCircuitClose?: () => void;
  /** 熔断半开回调 */
  onCircuitHalfOpen?: () => void;
}

/**
 * 限流熔断 Hooks 实现
 */
export class RateLimiterHooks {
  private registry: HookRegistry;
  private config: RateLimiterHooksConfig;
  private registeredHookIds: string[] = [];

  // 限流统计
  private sessionRateLimitStats: Map<string, RateLimitStats> = new Map();
  private toolRateLimitStats: Map<string, RateLimitStats> = new Map();
  private globalRateLimitStats: RateLimitStats = { timestamps: [], lastCleanup: Date.now() };

  // 熔断器统计
  private circuitBreakerStats: CircuitBreakerStats = {
    state: 'closed',
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    openedAt: null,
    totalFailures: 0,
    totalSuccesses: 0,
  };

  constructor(registry: HookRegistry, config: RateLimiterHooksConfig = {}) {
    this.registry = registry;
    this.config = config;
  }

  /**
   * 注册所有限流熔断 Hooks
   */
  register(priority: HookPriority = 'highest'): void {
    // 注册会话开始 Hook（会话限流）
    if (this.config.sessionRateLimit || this.config.globalRateLimit) {
      const id = this.registry.on(
        'session:start',
        this.handleSessionStart.bind(this),
        { priority, description: '限流 - 会话限流检查' }
      );
      this.registeredHookIds.push(id);
    }

    // 注册工具调用前 Hook（工具限流 + 熔断检查）
    if (this.config.toolRateLimits || this.config.circuitBreaker) {
      const id = this.registry.on(
        'tool:before',
        this.handleToolBefore.bind(this),
        { priority, description: '限流 - 工具限流检查' }
      );
      this.registeredHookIds.push(id);
    }

    // 注册错误 Hook（更新熔断器状态）
    if (this.config.circuitBreaker) {
      const id = this.registry.on(
        'session:error',
        this.handleSessionError.bind(this),
        { priority, description: '限流 - 熔断器错误记录' }
      );
      this.registeredHookIds.push(id);
    }
  }

  /**
   * 注销所有限流熔断 Hooks
   */
  unregister(): void {
    for (const id of this.registeredHookIds) {
      this.registry.off(id);
    }
    this.registeredHookIds = [];
  }

  // ============================================
  // Hook 处理器
  // ============================================

  /**
   * 处理会话开始（限流检查）
   */
  private async handleSessionStart(context: SessionStartHookContext): Promise<HookResult> {
    // 全局限流检查
    if (this.config.globalRateLimit) {
      const result = this.checkRateLimit(
        'global',
        'global',
        this.globalRateLimitStats,
        this.config.globalRateLimit
      );

      if (!result.allowed) {
        this.config.onRateLimited?.({
          type: 'global',
          key: 'global',
          retryAfter: result.retryAfter,
        });

        return {
          proceed: false,
          error: new Error(
            this.config.globalRateLimit.errorMessage ||
            `全局限流：请在 ${result.retryAfter}ms 后重试`
          ),
        };
      }
    }

    // 会话限流检查
    if (this.config.sessionRateLimit) {
      const stats = this.getOrCreateStats(context.sessionId, this.sessionRateLimitStats);
      const result = this.checkRateLimit(
        'session',
        context.sessionId,
        stats,
        this.config.sessionRateLimit
      );

      if (!result.allowed) {
        this.config.onRateLimited?.({
          type: 'session',
          key: context.sessionId,
          retryAfter: result.retryAfter,
        });

        return {
          proceed: false,
          error: new Error(
            this.config.sessionRateLimit.errorMessage ||
            `会话限流：请在 ${result.retryAfter}ms 后重试`
          ),
        };
      }
    }

    return { proceed: true };
  }

  /**
   * 处理工具调用前（工具限流 + 熔断检查）
   */
  private async handleToolBefore(context: ToolBeforeHookContext): Promise<HookResult<ToolBeforeHookModifiedContext>> {
    // 熔断器检查
    if (this.config.circuitBreaker) {
      const circuitResult = this.checkCircuitBreaker();
      if (!circuitResult.allowed) {
        return {
          proceed: false,
          error: new Error(
            this.config.circuitBreaker.errorMessage ||
            '熔断器已开启，服务暂时不可用'
          ),
        };
      }
    }

    // 工具级限流检查
    if (this.config.toolRateLimits) {
      const toolConfig = this.config.toolRateLimits.get(context.toolName);
      if (toolConfig) {
        const key = `${context.sessionId}:${context.toolName}`;
        const stats = this.getOrCreateStats(key, this.toolRateLimitStats);
        const result = this.checkRateLimit('tool', key, stats, toolConfig);

        if (!result.allowed) {
          this.config.onRateLimited?.({
            type: 'tool',
            key: context.toolName,
            retryAfter: result.retryAfter,
          });

          return {
            proceed: false,
            error: new Error(
              toolConfig.errorMessage ||
              `工具 ${context.toolName} 限流：请在 ${result.retryAfter}ms 后重试`
            ),
          };
        }
      }
    }

    return { proceed: true };
  }

  /**
   * 处理会话错误（更新熔断器状态）
   */
  private async handleSessionError(context: SessionErrorHookContext): Promise<HookResult> {
    if (!this.config.circuitBreaker) {
      return { proceed: true };
    }

    this.recordFailure();

    return { proceed: true };
  }

  /**
   * 记录成功（外部调用）
   */
  recordSuccess(): void {
    if (!this.config.circuitBreaker) return;

    const stats = this.circuitBreakerStats;
    stats.consecutiveFailures = 0;
    stats.consecutiveSuccesses++;
    stats.totalSuccesses++;

    // 半开状态下，检查是否可以关闭
    if (stats.state === 'half-open') {
      if (stats.consecutiveSuccesses >= (this.config.circuitBreaker?.successThreshold || 3)) {
        this.closeCircuit();
      }
    }
  }

  /**
   * 记录失败（外部调用）
   */
  recordFailure(): void {
    if (!this.config.circuitBreaker) return;

    const stats = this.circuitBreakerStats;
    stats.consecutiveSuccesses = 0;
    stats.consecutiveFailures++;
    stats.totalFailures++;

    // 关闭状态下，检查是否需要打开
    if (stats.state === 'closed') {
      if (stats.consecutiveFailures >= (this.config.circuitBreaker?.failureThreshold || 5)) {
        this.openCircuit();
      }
    }
    // 半开状态下，任何失败都会重新打开
    else if (stats.state === 'half-open') {
      this.openCircuit();
    }
  }

  // ============================================
  // 限流方法
  // ============================================

  /**
   * 获取或创建限流统计
   */
  private getOrCreateStats(key: string, map: Map<string, RateLimitStats>): RateLimitStats {
    let stats = map.get(key);
    if (!stats) {
      stats = { timestamps: [], lastCleanup: Date.now() };
      map.set(key, stats);
    }
    return stats;
  }

  /**
   * 检查限流
   */
  private checkRateLimit(
    type: 'session' | 'tool' | 'global',
    key: string,
    stats: RateLimitStats,
    config: RateLimitConfig
  ): { allowed: boolean; retryAfter: number } {
    const now = Date.now();

    // 清理过期的时间戳
    this.cleanupOldTimestamps(stats, now, config.windowMs);

    // 检查是否超过限制
    if (stats.timestamps.length >= config.maxRequests) {
      const oldestTimestamp = stats.timestamps[0];
      const retryAfter = oldestTimestamp + config.windowMs - now;
      return { allowed: false, retryAfter: Math.max(0, retryAfter) };
    }

    // 记录本次请求
    stats.timestamps.push(now);

    return { allowed: true, retryAfter: 0 };
  }

  /**
   * 清理过期的时间戳
   */
  private cleanupOldTimestamps(stats: RateLimitStats, now: number, windowMs: number): void {
    const cutoff = now - windowMs;
    stats.timestamps = stats.timestamps.filter(ts => ts > cutoff);
    stats.lastCleanup = now;
  }

  // ============================================
  // 熔断器方法
  // ============================================

  /**
   * 检查熔断器状态
   */
  private checkCircuitBreaker(): { allowed: boolean } {
    const stats = this.circuitBreakerStats;

    switch (stats.state) {
      case 'closed':
        return { allowed: true };

      case 'open':
        // 检查是否可以进入半开状态
        const now = Date.now();
        if (stats.openedAt && now - stats.openedAt >= (this.config.circuitBreaker?.timeout || 30000)) {
          this.halfOpenCircuit();
          return { allowed: true };
        }
        return { allowed: false };

      case 'half-open':
        return { allowed: true };

      default:
        return { allowed: true };
    }
  }

  /**
   * 打开熔断器
   */
  private openCircuit(): void {
    this.circuitBreakerStats.state = 'open';
    this.circuitBreakerStats.openedAt = Date.now();
    this.config.onCircuitOpen?.();
  }

  /**
   * 半开熔断器
   */
  private halfOpenCircuit(): void {
    this.circuitBreakerStats.state = 'half-open';
    this.circuitBreakerStats.consecutiveSuccesses = 0;
    this.config.onCircuitHalfOpen?.();
  }

  /**
   * 关闭熔断器
   */
  private closeCircuit(): void {
    this.circuitBreakerStats.state = 'closed';
    this.circuitBreakerStats.consecutiveFailures = 0;
    this.circuitBreakerStats.consecutiveSuccesses = 0;
    this.circuitBreakerStats.openedAt = null;
    this.config.onCircuitClose?.();
  }

  // ============================================
  // 状态查询
  // ============================================

  /**
   * 获取熔断器状态
   */
  getCircuitBreakerState(): CircuitBreakerStats {
    return { ...this.circuitBreakerStats };
  }

  /**
   * 获取会话限流统计
   */
  getSessionRateLimitStats(sessionId?: string): RateLimitStats | Map<string, RateLimitStats> | undefined {
    if (sessionId) {
      return this.sessionRateLimitStats.get(sessionId);
    }
    return new Map(this.sessionRateLimitStats);
  }

  /**
   * 获取工具限流统计
   */
  getToolRateLimitStats(key?: string): RateLimitStats | Map<string, RateLimitStats> | undefined {
    if (key) {
      return this.toolRateLimitStats.get(key);
    }
    return new Map(this.toolRateLimitStats);
  }

  /**
   * 重置熔断器
   */
  resetCircuitBreaker(): void {
    this.circuitBreakerStats = {
      state: 'closed',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      openedAt: null,
      totalFailures: 0,
      totalSuccesses: 0,
    };
  }

  /**
   * 重置所有限流统计
   */
  resetRateLimits(): void {
    this.sessionRateLimitStats.clear();
    this.toolRateLimitStats.clear();
    this.globalRateLimitStats = { timestamps: [], lastCleanup: Date.now() };
  }

  /**
   * 获取已注册的 Hook IDs
   */
  getRegisteredHookIds(): string[] {
    return [...this.registeredHookIds];
  }
}

/**
 * 创建限流熔断 Hooks 实例
 */
export function createRateLimiterHooks(
  registry: HookRegistry,
  config?: RateLimiterHooksConfig
): RateLimiterHooks {
  return new RateLimiterHooks(registry, config);
}
