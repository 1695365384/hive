/**
 * Token Bucket Rate Limiter
 *
 * 令牌桶限流器 — 控制并发 Worker 对 LLM API 的调用速率，防止批量 Worker 触发 429。
 *
 * 算法：
 *   - 桶容量 = maxTokens（最大突发并发数）
 *   - 填充速率 = refillRate 令牌/秒（稳态并发速率）
 *   - 每次 Worker 启动消耗 1 个令牌
 *   - 令牌不足时，等待直到令牌恢复
 *
 * 默认值（保守策略，适合大多数 LLM API）：
 *   - 桶容量 = 5（同时最多 5 个 Worker 爆发启动）
 *   - 填充速率 = 2/秒（稳定状态每秒最多启动 2 个 Worker）
 */

export interface RateLimiterConfig {
  /** 桶容量（最大突发令牌数） */
  maxTokens?: number;
  /** 每秒补充的令牌数 */
  refillRate?: number;
}

export class TokenBucketRateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private lastRefill: number;

  constructor(config: RateLimiterConfig = {}) {
    this.maxTokens = config.maxTokens ?? 5;
    this.refillRate = config.refillRate ?? 2;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * 获取一个令牌（消耗一个并发槽位）。
   * 若桶空，等待直到有令牌补充。
   */
  async acquire(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      // 等待下一次令牌补充所需的时间
      const msPerToken = 1000 / this.refillRate;
      await new Promise<void>(resolve => setTimeout(resolve, msPerToken));
    }
  }

  /**
   * 释放令牌（Worker 完成后调用，将令牌归还桶中）
   */
  release(): void {
    this.refill();
    this.tokens = Math.min(this.tokens + 1, this.maxTokens);
  }

  /**
   * 当前可用令牌数（仅供观测）
   */
  get available(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;
    if (newTokens >= 0.01) { // 避免浮点噪声
      this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }
}

/** 进程级默认限流器（所有 Agent 共享） */
let _defaultLimiter: TokenBucketRateLimiter | null = null;

export function getDefaultRateLimiter(): TokenBucketRateLimiter {
  if (!_defaultLimiter) {
    _defaultLimiter = new TokenBucketRateLimiter();
  }
  return _defaultLimiter;
}

/** 替换默认限流器（测试用） */
export function setDefaultRateLimiter(limiter: TokenBucketRateLimiter): void {
  _defaultLimiter = limiter;
}
