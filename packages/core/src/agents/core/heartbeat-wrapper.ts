/**
 * 心跳和超时包装器
 *
 * 统一 chat/chatStream 的心跳启动、超时控制和心跳停止逻辑
 */

import type { AgentOptions } from './types.js';
import type { AgentContextImpl } from './AgentContext.js';

/**
 * 使用心跳和超时包装 Promise
 */
export async function withHeartbeat<T>(
  context: AgentContextImpl,
  promise: Promise<T>,
  prompt: string,
  options?: AgentOptions
): Promise<T> {
  const sessionId = context.hookRegistry.getSessionId();
  const startTime = Date.now();
  const timeoutConfig = context.timeoutCap.getConfig();
  const executionTimeout = options?.executionTimeout ?? timeoutConfig.executionTimeout;

  // 触发 session:start hook
  await context.hookRegistry.emit('session:start', {
    sessionId,
    prompt,
    timestamp: new Date(),
  });

  const abortController = new AbortController();

  // 启动心跳检测
  context.timeoutCap.startHeartbeat(
    {
      interval: timeoutConfig.heartbeatInterval,
      stallTimeout: timeoutConfig.stallTimeout,
      onStalled: async (lastActivity) => {
        await context.hookRegistry.emit('timeout:stalled', {
          sessionId,
          lastActivity,
          stallDuration: Date.now() - lastActivity,
          stallTimeout: timeoutConfig.stallTimeout,
          timestamp: new Date(),
        });
      },
    },
    abortController
  );

  try {
    const result = await context.timeoutCap.withTimeout(
      promise,
      executionTimeout,
      `Agent execution timed out after ${executionTimeout}ms`
    );

    await context.hookRegistry.emit('session:end', {
      sessionId,
      success: true,
      timestamp: new Date(),
      duration: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    await context.hookRegistry.emit('session:error', {
      sessionId,
      error: err,
      timestamp: new Date(),
      recoverable: false,
    });

    await context.hookRegistry.emit('session:end', {
      sessionId,
      success: false,
      reason: err.message,
      timestamp: new Date(),
      duration: Date.now() - startTime,
    });

    throw error;
  } finally {
    context.timeoutCap.stopHeartbeat();
  }
}
