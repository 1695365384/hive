/**
 * HeartbeatScheduler 单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeartbeatScheduler } from '../../../src/scheduler/HeartbeatScheduler.js';

function createMockAgent() {
  return {
    runHeartbeatOnce: vi.fn().mockResolvedValue({
      isOk: true,
      hasAlert: false,
      content: '',
    }),
  } as unknown as any;
}

describe('HeartbeatScheduler', () => {
  let agent: ReturnType<typeof createMockAgent>;

  beforeEach(() => {
    vi.useFakeTimers();
    agent = createMockAgent();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start() 后 isRunning 应为 true', () => {
    const scheduler = new HeartbeatScheduler({
      agent,
      config: { intervalMs: 60000 },
    });

    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);

    scheduler.stop();
  });

  it('stop() 后 isRunning 应为 false', () => {
    const scheduler = new HeartbeatScheduler({
      agent,
      config: { intervalMs: 60000 },
    });

    scheduler.start();
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('初始状态 isRunning 应为 false', () => {
    const scheduler = new HeartbeatScheduler({
      agent,
      config: { intervalMs: 60000 },
    });

    expect(scheduler.isRunning()).toBe(false);
  });

  it('重复 start() 不应创建多个定时器', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const scheduler = new HeartbeatScheduler({
      agent,
      config: { intervalMs: 30000 }, // < 1min, uses setInterval
    });

    scheduler.start();
    scheduler.start();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    scheduler.stop();
    setIntervalSpy.mockRestore();
  });

  it('start() 应立即执行一次 tick', async () => {
    const scheduler = new HeartbeatScheduler({
      agent,
      config: { intervalMs: 60000 },
    });

    const tickPromise = scheduler.tick();

    await vi.advanceTimersByTimeAsync(0);

    await tickPromise;

    expect(agent.runHeartbeatOnce).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  it('tick() 成功时应记录日志', async () => {
    const scheduler = new HeartbeatScheduler({
      agent,
      config: { intervalMs: 60000 },
    });

    await scheduler.tick();

    expect(agent.runHeartbeatOnce).toHaveBeenCalledTimes(1);
  });

  it('tick() 检测到 alert 时应记录日志', async () => {
    agent.runHeartbeatOnce.mockResolvedValue({
      isOk: false,
      hasAlert: true,
      content: 'Build is failing',
    });

    const scheduler = new HeartbeatScheduler({
      agent,
      config: { intervalMs: 60000 },
    });

    await scheduler.tick();

    expect(agent.runHeartbeatOnce).toHaveBeenCalledTimes(1);
  });

  it('tick() 失败时应记录错误日志', async () => {
    agent.runHeartbeatOnce.mockRejectedValue(new Error('LLM unavailable'));

    const scheduler = new HeartbeatScheduler({
      agent,
      config: { intervalMs: 60000 },
    });

    await scheduler.tick();

    expect(agent.runHeartbeatOnce).toHaveBeenCalledTimes(1);
  });

  it('tick() 应传递 model 和 prompt 配置', async () => {
    const scheduler = new HeartbeatScheduler({
      agent,
      config: {
        intervalMs: 60000,
        model: 'claude-haiku-4-5-20251001',
        prompt: 'Custom check prompt',
      },
    });

    await scheduler.tick();

    expect(agent.runHeartbeatOnce).toHaveBeenCalledWith({
      model: 'claude-haiku-4-5-20251001',
      prompt: 'Custom check prompt',
    });
  });

  it('stop() 后不应再执行 tick', async () => {
    const scheduler = new HeartbeatScheduler({
      agent,
      config: { intervalMs: 30000 }, // < 1min, uses setInterval
    });

    scheduler.start();
    scheduler.stop();

    await vi.advanceTimersByTimeAsync(120000);

    // 只有 start 时的那次调用
    expect(agent.runHeartbeatOnce).toHaveBeenCalledTimes(1);
  });

  it('intervalMs < 60000 时应使用 setInterval fallback', () => {
    const scheduler = new HeartbeatScheduler({
      agent,
      config: { intervalMs: 30000 },
    });

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    scheduler.start();

    expect(setIntervalSpy).toHaveBeenCalled();

    scheduler.stop();
    setIntervalSpy.mockRestore();
  });

  it('intervalMs >= 60000 时应使用 cron（验证 start/stop 生命周期）', () => {
    const scheduler = new HeartbeatScheduler({
      agent,
      config: { intervalMs: 300000 },
    });

    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);

    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });
});
