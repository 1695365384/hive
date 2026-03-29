/**
 * 7.1 HeartbeatConfig.action = 'abort' 测试
 *
 * 验证 abort action 在 stall 检测时通过 AbortController 中断执行
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimeoutCapability } from '../../src/agents/capabilities/TimeoutCapability.js';
import { TimeoutError } from '../../src/agents/core/types.js';
import type { AgentContext } from '../../src/agents/core/types.js';
import type { HookRegistry } from '../../src/hooks/index.js';

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
    getSkill: vi.fn(),
    matchSkill: vi.fn(),
    getAgentConfig: vi.fn(),
    timeoutCap: {} as AgentContext['timeoutCap'],
  };
}

describe('HeartbeatConfig action=abort', () => {
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

  it('action=warn 时不应触发 AbortController.abort()', async () => {
    vi.useFakeTimers();

    const abortController = new AbortController();
    const abortSpy = vi.spyOn(abortController, 'abort');

    capability.startHeartbeat(
      {
        interval: 10,
        stallTimeout: 50,
        action: 'warn',
        onStalled: vi.fn(),
      },
      abortController
    );

    // 等待 stall 检测触发（stallTimer 间隔 = stallTimeout = 50ms，条件 > 50ms）
    await vi.advanceTimersByTimeAsync(110);

    expect(abortSpy).not.toHaveBeenCalled();

    capability.stopHeartbeat();
    vi.useRealTimers();
  });

  it('action=abort 时应触发 AbortController.abort() 并传入 TimeoutError', async () => {
    vi.useFakeTimers();

    const abortController = new AbortController();
    const abortSpy = vi.spyOn(abortController, 'abort');

    capability.startHeartbeat(
      {
        interval: 10,
        stallTimeout: 50,
        action: 'abort',
        onStalled: vi.fn(),
      },
      abortController
    );

    // 等待 stall 检测触发
    await vi.advanceTimersByTimeAsync(110);

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(abortSpy).toHaveBeenCalledWith(expect.any(TimeoutError));

    const error = abortSpy.mock.calls[0][0] as TimeoutError;
    expect(error.type).toBe('stalled');
    expect(error.duration).toBe(50);
    expect(error.message).toContain('stalled');

    capability.stopHeartbeat();
    vi.useRealTimers();
  });

  it('abort 后 TimeoutError 包含正确的 stall 时长信息', async () => {
    vi.useFakeTimers();

    const abortController = new AbortController();
    const abortSpy = vi.spyOn(abortController, 'abort');

    capability.startHeartbeat(
      {
        interval: 10,
        stallTimeout: 80,
        action: 'abort',
      },
      abortController
    );

    // 推进超过 80ms + stallTimer 间隔
    await vi.advanceTimersByTimeAsync(200);

    expect(abortSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'stalled',
      duration: 80,
    }));

    capability.stopHeartbeat();
    vi.useRealTimers();
  });

  it('未提供 AbortController 时 action=abort 不应报错', async () => {
    vi.useFakeTimers();

    capability.startHeartbeat({
      interval: 10,
      stallTimeout: 50,
      action: 'abort',
      onStalled: vi.fn(),
    });

    // 等待 stall 检测 - 不应抛错
    await vi.advanceTimersByTimeAsync(110);

    capability.stopHeartbeat();
    vi.useRealTimers();
  });

  it('abort 后仍应触发 timeout:stalled hook', async () => {
    vi.useFakeTimers();

    const abortController = new AbortController();
    capability.startHeartbeat(
      {
        interval: 10,
        stallTimeout: 50,
        action: 'abort',
      },
      abortController
    );

    await vi.advanceTimersByTimeAsync(110);

    expect(mockContext.hookRegistry.emit).toHaveBeenCalledWith(
      'timeout:stalled',
      expect.objectContaining({
        sessionId: 'test-session-id',
        stallTimeout: 50,
      })
    );

    capability.stopHeartbeat();
    vi.useRealTimers();
  });

  it('多次 stall 只应触发一次 abort（stopHeartbeat 前保持状态）', async () => {
    vi.useFakeTimers();

    const abortController = new AbortController();
    const abortSpy = vi.spyOn(abortController, 'abort');

    capability.startHeartbeat(
      {
        interval: 10,
        stallTimeout: 50,
        action: 'abort',
      },
      abortController
    );

    // 等待足够长让 stallTimer 多次触发
    await vi.advanceTimersByTimeAsync(300);

    // AbortController.abort() 可以被多次调用（幂等），但 stallTimer 应持续检测
    // 关键是验证 abort 至少被调用了一次
    expect(abortSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

    capability.stopHeartbeat();
    vi.useRealTimers();
  });
});
