/**
 * TimeoutCapability 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimeoutCapability, createTimeoutCapability } from '../../src/agents/capabilities/TimeoutCapability.js';
import { TimeoutError } from '../../src/agents/core/types.js';
import type { AgentContext } from '../../src/agents/core/types.js';
import type { HookRegistry } from '../../src/hooks/index.js';

// 创建 mock AgentContext
function createMockContext(): AgentContext {
  const hookRegistry = {
    getSessionId: () => 'test-session-id',
    emit: vi.fn().mockResolvedValue(undefined),
  } as unknown as HookRegistry;

  return {
    hookRegistry,
    providerManager: {} as AgentContext['providerManager'],
    runner: {} as AgentContext['runner'],
    skillRegistry: {} as AgentContext['skillRegistry'],
    agentRegistry: {} as AgentContext['agentRegistry'],
    getCapability: vi.fn(),
    getActiveProvider: vi.fn(),
    getSkill: vi.fn(),
    matchSkill: vi.fn(),
    getAgentConfig: vi.fn(),
    timeoutCap: {} as AgentContext['timeoutCap'],
  };
}

describe('TimeoutCapability', () => {
  let capability: TimeoutCapability;
  let mockContext: AgentContext;

  beforeEach(() => {
    mockContext = createMockContext();
    capability = new TimeoutCapability();
    capability.initialize(mockContext);
  });

  afterEach(() => {
    capability.dispose();
  });

  describe('配置', () => {
    it('应该使用默认配置', () => {
      const config = capability.getConfig();
      expect(config.apiTimeout).toBe(120000);
      expect(config.executionTimeout).toBe(600000);
      expect(config.heartbeatInterval).toBe(30000);
      expect(config.stallTimeout).toBe(120000);
    });

    it('应该支持自定义配置', () => {
      const customCapability = new TimeoutCapability({
        apiTimeout: 5000,
        executionTimeout: 10000,
      });
      customCapability.initialize(mockContext);

      const config = customCapability.getConfig();
      expect(config.apiTimeout).toBe(5000);
      expect(config.executionTimeout).toBe(10000);

      customCapability.dispose();
    });

    it('应该支持运行时更新配置', () => {
      capability.updateConfig({ apiTimeout: 3000 });
      expect(capability.getConfig().apiTimeout).toBe(3000);
    });
  });

  describe('createAbortController', () => {
    it('应该创建 AbortController', () => {
      const result = capability.createAbortController(1000);
      expect(result.controller).toBeInstanceOf(AbortController);
      expect(result.clear).toBeInstanceOf(Function);
    });

    it('应该在超时后触发 abort', async () => {
      vi.useFakeTimers();

      const result = capability.createAbortController(100);
      const abortSpy = vi.spyOn(result.controller, 'abort');

      // 立即添加 catch handler 避免后续的 unhandled rejection
      const timeoutPromiseHandled = result.timeoutPromise.catch(() => {});

      await vi.advanceTimersByTimeAsync(100);

      expect(abortSpy).toHaveBeenCalled();

      result.clear();
      await timeoutPromiseHandled;
      vi.useRealTimers();
    });

    it('clear 应该取消超时', async () => {
      vi.useFakeTimers();

      const result = capability.createAbortController(100);
      const abortSpy = vi.spyOn(result.controller, 'abort');

      result.clear();
      await vi.advanceTimersByTimeAsync(200);

      expect(abortSpy).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('withTimeout', () => {
    it('应该在 Promise 完成时返回结果', async () => {
      const promise = Promise.resolve('success');
      const result = await capability.withTimeout(promise, 1000);
      expect(result).toBe('success');
    });

    it('应该在超时时抛出 TimeoutError', async () => {
      vi.useFakeTimers();

      const promise = new Promise<string>((resolve) => {
        setTimeout(() => resolve('late'), 500);
      });

      // 在调用 withTimeout 之前，先设置好处理方式
      const timeoutPromise = capability.withTimeout(promise, 100);

      // 先设置 catch handler，然后再推进时间
      const errorPromise = timeoutPromise.catch(e => e);

      // 推进时间触发超时
      await vi.advanceTimersByTimeAsync(100);

      // 现在可以安全地等待错误
      const error = await errorPromise;
      expect(error).toBeInstanceOf(TimeoutError);

      vi.useRealTimers();
    });

    it('应该传播原始 Promise 的错误', async () => {
      const promise = Promise.reject(new Error('original error'));

      await expect(capability.withTimeout(promise, 1000)).rejects.toThrow('original error');
    });
  });

  describe('withTimeoutAndRetry', () => {
    it('首次成功时应该返回结果', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await capability.withTimeoutAndRetry(fn, 1000);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('超时后应该重试', async () => {
      vi.useFakeTimers();

      // 启用重试配置
      capability.updateConfig({ retryOnTimeout: true, maxRetries: 2 });

      let callCount = 0;
      const fn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          // 第一次调用会超时
          return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('timeout')), 500);
          });
        }
        // 第二次调用成功
        return Promise.resolve('success after retry');
      });

      const timeoutPromise = capability.withTimeoutAndRetry(fn, 100);

      // 先设置 catch handler
      const resultPromise = timeoutPromise.catch(e => e);

      // 推进时间触发第一次超时
      await vi.advanceTimersByTimeAsync(100);
      // 等待重试延迟（1000ms * 1 = 1000ms）
      await vi.advanceTimersByTimeAsync(1000);
      // 等待第二次调用完成
      await vi.advanceTimersByTimeAsync(100);

      const result = await resultPromise;
      expect(result).toBe('success after retry');
      expect(fn).toHaveBeenCalledTimes(2);

      capability.updateConfig({ retryOnTimeout: false, maxRetries: 0 });
      vi.useRealTimers();
    });

    it('非超时错误应该直接抛出', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('non-timeout error'));

      await expect(capability.withTimeoutAndRetry(fn, 1000)).rejects.toThrow('non-timeout error');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('重试次数用尽后应该抛出错误', async () => {
      vi.useFakeTimers();

      // 启用重试配置
      capability.updateConfig({ retryOnTimeout: true, maxRetries: 1 });

      const fn = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), 500);
        });
      });

      const timeoutPromise = capability.withTimeoutAndRetry(fn, 100);

      // 先设置 catch handler
      const errorPromise = timeoutPromise.catch(e => e);

      // 推进时间触发第一次超时
      await vi.advanceTimersByTimeAsync(100);
      // 等待重试延迟
      await vi.advanceTimersByTimeAsync(1000);
      // 推进时间触发第二次超时
      await vi.advanceTimersByTimeAsync(100);

      const error = await errorPromise;
      expect(error).toBeInstanceOf(TimeoutError);
      expect(fn).toHaveBeenCalledTimes(2);

      capability.updateConfig({ retryOnTimeout: false, maxRetries: 0 });
      vi.useRealTimers();
    });

    it('应该使用指数退避等待', async () => {
      vi.useFakeTimers();

      // 启用重试配置
      capability.updateConfig({ retryOnTimeout: true, maxRetries: 2 });

      let callCount = 0;
      const delays: number[] = [];
      const fn = vi.fn().mockImplementation(() => {
        callCount++;
        const start = Date.now();
        return new Promise((_, reject) => {
          setTimeout(() => {
            delays.push(Date.now() - start);
            reject(new TimeoutError('timeout', 'api', 100));
          }, 200);
        });
      });

      const timeoutPromise = capability.withTimeoutAndRetry(fn, 100);
      const errorPromise = timeoutPromise.catch(e => e);

      // 推进足够的时间让所有重试完成
      // 第一次超时: 100ms
      await vi.advanceTimersByTimeAsync(100);
      // 指数退避 1: 1000ms * 1 = 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      // 第二次超时: 100ms
      await vi.advanceTimersByTimeAsync(100);
      // 指数退避 2: 1000ms * 2 = 2000ms
      await vi.advanceTimersByTimeAsync(2000);
      // 第三次超时: 100ms
      await vi.advanceTimersByTimeAsync(100);

      await errorPromise;
      expect(fn).toHaveBeenCalledTimes(3);

      capability.updateConfig({ retryOnTimeout: false, maxRetries: 0 });
      vi.useRealTimers();
    });

    it('超时时应该触发 timeout:api hook', async () => {
      vi.useFakeTimers();

      // 启用重试配置
      capability.updateConfig({ retryOnTimeout: true, maxRetries: 1 });

      const fn = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new TimeoutError('timeout', 'api', 100)), 200);
        });
      });

      const timeoutPromise = capability.withTimeoutAndRetry(fn, 100);
      const errorPromise = timeoutPromise.catch(e => e);

      // 触发第一次超时
      await vi.advanceTimersByTimeAsync(100);

      // 验证 hook 被触发
      expect(mockContext.hookRegistry.emit).toHaveBeenCalledWith(
        'timeout:api',
        expect.objectContaining({
          sessionId: 'test-session-id',
          attempt: 1,
          maxAttempts: 2,
          timeout: 100,
        })
      );

      // 清理
      await vi.advanceTimersByTimeAsync(2000);
      await errorPromise;

      capability.updateConfig({ retryOnTimeout: false, maxRetries: 0 });
      vi.useRealTimers();
    });
  });

  describe('startExecutionTimer', () => {
    it('超时后应该触发回调', async () => {
      vi.useFakeTimers();

      const onTimeout = vi.fn();
      const clear = capability.startExecutionTimer(100, onTimeout);

      await vi.advanceTimersByTimeAsync(100);

      expect(onTimeout).toHaveBeenCalled();

      clear();
      vi.useRealTimers();
    });

    it('应该触发 timeout:execution hook', async () => {
      vi.useFakeTimers();

      const onTimeout = vi.fn();
      const clear = capability.startExecutionTimer(100, onTimeout);

      await vi.advanceTimersByTimeAsync(100);

      expect(mockContext.hookRegistry.emit).toHaveBeenCalledWith(
        'timeout:execution',
        expect.objectContaining({
          sessionId: 'test-session-id',
          timeout: 100,
        })
      );

      clear();
      vi.useRealTimers();
    });

    it('clear 应该取消计时器', async () => {
      vi.useFakeTimers();

      const onTimeout = vi.fn();
      const clear = capability.startExecutionTimer(100, onTimeout);

      clear();
      await vi.advanceTimersByTimeAsync(200);

      expect(onTimeout).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('心跳检测', () => {
    it('startHeartbeat 应该启动心跳', async () => {
      vi.useFakeTimers();

      const onHeartbeat = vi.fn();
      capability.startHeartbeat({
        interval: 100,
        stallTimeout: 500,
        onHeartbeat,
      });

      expect(capability.isHeartbeatRunning()).toBe(true);

      await vi.advanceTimersByTimeAsync(100);
      expect(onHeartbeat).toHaveBeenCalled();

      capability.stopHeartbeat();
      vi.useRealTimers();
    });

    it('stopHeartbeat 应该停止心跳', () => {
      capability.startHeartbeat({
        interval: 100,
        stallTimeout: 500,
      });

      expect(capability.isHeartbeatRunning()).toBe(true);

      capability.stopHeartbeat();

      expect(capability.isHeartbeatRunning()).toBe(false);
    });

    it('updateActivity 应该更新活动时间', () => {
      vi.useFakeTimers();

      capability.startHeartbeat({
        interval: 100,
        stallTimeout: 500,
      });

      const initialActivity = capability.getLastActivity();

      // 等待一小段时间
      vi.advanceTimersByTime(10);

      capability.updateActivity();

      const newActivity = capability.getLastActivity();
      expect(newActivity).toBeGreaterThan(initialActivity!);

      capability.stopHeartbeat();
      vi.useRealTimers();
    });

    it('isStalled 应该检测到卡住', async () => {
      vi.useFakeTimers();

      capability.startHeartbeat({
        interval: 10,
        stallTimeout: 50,
      });

      expect(capability.isStalled()).toBe(false);

      // 模拟时间流逝 - 需要超过 stallTimeout
      // stallTimer 的间隔是 stallTimeout，检查条件是 > stallTimeout
      await vi.advanceTimersByTimeAsync(110);

      expect(capability.isStalled()).toBe(true);

      capability.stopHeartbeat();
      vi.useRealTimers();
    });

    it('检测到卡住时应该触发 onStalled 回调', async () => {
      vi.useFakeTimers();

      const onStalled = vi.fn();
      capability.startHeartbeat({
        interval: 10,
        stallTimeout: 50,
        onStalled,
      });

      // 模拟时间流逝超过 stallTimeout
      // stallTimer 的间隔是 stallTimeout，需要等待 stallTimer 触发
      // 并且检查条件是 timeSinceLastActivity > stallTimeout
      // 所以需要等待超过 stallTimeout 的时间让条件满足
      await vi.advanceTimersByTimeAsync(110);

      expect(onStalled).toHaveBeenCalled();

      capability.stopHeartbeat();
      vi.useRealTimers();
    });
  });

  describe('Hook 触发', () => {
    it('检测到卡住时应该触发 timeout:stalled hook', async () => {
      vi.useFakeTimers();

      capability.startHeartbeat({
        interval: 10,
        stallTimeout: 50,
      });

      // 模拟时间流逝超过 stallTimeout
      // 需要等待 stallTimer 触发并且检查条件满足
      await vi.advanceTimersByTimeAsync(110);

      expect(mockContext.hookRegistry.emit).toHaveBeenCalledWith(
        'timeout:stalled',
        expect.objectContaining({
          sessionId: 'test-session-id',
        })
      );

      capability.stopHeartbeat();
      vi.useRealTimers();
    });

    it('心跳时应该触发 health:heartbeat hook', async () => {
      vi.useFakeTimers();

      capability.startHeartbeat({
        interval: 100,
        stallTimeout: 500,
      });

      await vi.advanceTimersByTimeAsync(100);

      expect(mockContext.hookRegistry.emit).toHaveBeenCalledWith(
        'health:heartbeat',
        expect.objectContaining({
          sessionId: 'test-session-id',
        })
      );

      capability.stopHeartbeat();
      vi.useRealTimers();
    });
  });

  describe('边界场景', () => {
    it('心跳未启动时 updateActivity 应该无操作', () => {
      // 确保心跳未启动
      expect(capability.isHeartbeatRunning()).toBe(false);

      // 调用 updateActivity 不应该抛出错误
      expect(() => capability.updateActivity()).not.toThrow();
    });

    it('心跳未启动时 isStalled 应该返回 false', () => {
      // 确保心跳未启动
      expect(capability.isHeartbeatRunning()).toBe(false);

      expect(capability.isStalled()).toBe(false);
    });

    it('心跳未启动时 getLastActivity 应该返回 null', () => {
      // 确保心跳未启动
      expect(capability.isHeartbeatRunning()).toBe(false);

      expect(capability.getLastActivity()).toBeNull();
    });

    it('多次调用 startHeartbeat 应该只保留最后一个', async () => {
      vi.useFakeTimers();

      const onHeartbeat1 = vi.fn();
      const onHeartbeat2 = vi.fn();

      // 第一次启动
      capability.startHeartbeat({
        interval: 100,
        stallTimeout: 500,
        onHeartbeat: onHeartbeat1,
      });

      // 第二次启动（应该覆盖第一次）
      capability.startHeartbeat({
        interval: 100,
        stallTimeout: 500,
        onHeartbeat: onHeartbeat2,
      });

      await vi.advanceTimersByTimeAsync(100);

      // 只有第二次的回调应该被调用
      expect(onHeartbeat1).not.toHaveBeenCalled();
      expect(onHeartbeat2).toHaveBeenCalled();

      capability.stopHeartbeat();
      vi.useRealTimers();
    });

    it('未启动时 stopHeartbeat 应该无操作', () => {
      // 确保心跳未启动
      expect(capability.isHeartbeatRunning()).toBe(false);

      // 调用 stopHeartbeat 不应该抛出错误
      expect(() => capability.stopHeartbeat()).not.toThrow();
    });

    it('dispose 时应该自动停止心跳', () => {
      vi.useFakeTimers();

      capability.startHeartbeat({
        interval: 100,
        stallTimeout: 500,
      });

      expect(capability.isHeartbeatRunning()).toBe(true);

      capability.dispose();

      expect(capability.isHeartbeatRunning()).toBe(false);

      vi.useRealTimers();
    });
  });
});

describe('createTimeoutCapability', () => {
  it('应该创建 TimeoutCapability 实例', () => {
    const capability = createTimeoutCapability({ apiTimeout: 5000 });
    expect(capability).toBeInstanceOf(TimeoutCapability);
    expect(capability.getConfig().apiTimeout).toBe(5000);
  });
});

describe('TimeoutError', () => {
  it('应该正确设置属性', () => {
    const error = new TimeoutError('Test timeout', 'api', 1000);
    expect(error.message).toBe('Test timeout');
    expect(error.name).toBe('TimeoutError');
    expect(error.type).toBe('api');
    expect(error.duration).toBe(1000);
  });
});
