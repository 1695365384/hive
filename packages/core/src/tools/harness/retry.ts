/**
 * 重试逻辑
 *
 * 仅对 TRANSIENT 类错误（TIMEOUT, NETWORK, RATE_LIMITED）进行静默重试。
 * RECOVERABLE 和 BLOCKED 类错误不重试。
 */

import { TRANSIENT_CODES } from './types.js';
import type { ToolResult } from './types.js';

/**
 * 判断错误码是否可重试（瞬态错误）
 */
export function isRetryable(code: string): boolean {
  return (TRANSIENT_CODES as readonly string[]).includes(code);
}

/**
 * 带指数退避的重试
 *
 * @param fn - 返回 ToolResult 的异步函数
 * @param options - 重试配置
 * @returns ToolResult（最终结果）
 */
export async function retryWithBackoff(
  fn: () => Promise<ToolResult>,
  options: { maxRetries?: number; baseDelay?: number } = {},
): Promise<ToolResult> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelay = options.baseDelay ?? 500;

  let result = await fn();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (result.ok || !isRetryable(result.code)) break;

    const delay = baseDelay * Math.pow(2, attempt);
    await sleep(delay);
    result = await fn();
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
