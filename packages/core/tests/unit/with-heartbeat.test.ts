/**
 * 7.4 withHeartbeat() 重构测试
 *
 * 验证 chat 心跳行为
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Agent } from '../../src/agents/core/Agent.js';
import { TimeoutError } from '../../src/agents/core/types.js';

describe('Agent.withHeartbeat()', () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('chat() 心跳行为', () => {
    it('成功时应触发 session:start 和 session:end hooks', async () => {
      const emitSpy = vi.spyOn(agent.context.hookRegistry, 'emit').mockResolvedValue(true);
      // Mock chatCap.send 通过 spy on Agent.chat 是不行的，需要直接 mock ChatCapability
      // 通过 monkey-patching Agent 类的 chatCap.send
      const chatCap = (agent as any).chatCap;
      vi.spyOn(chatCap, 'send').mockResolvedValue('Hello!');

      await agent.chat('Test prompt');

      const calls = emitSpy.mock.calls.map(c => c[0]);
      expect(calls).toContain('session:start');
      expect(calls).toContain('session:end');

      // session:end 应该包含 success: true
      const sessionEndCall = emitSpy.mock.calls.find(c => c[0] === 'session:end');
      expect((sessionEndCall?.[1] as any)?.success).toBe(true);
    });

    it('session:start 应包含 prompt 和 sessionId', async () => {
      const emitSpy = vi.spyOn(agent.context.hookRegistry, 'emit').mockResolvedValue(true);
      const chatCap = (agent as any).chatCap;
      vi.spyOn(chatCap, 'send').mockResolvedValue('Hello!');

      await agent.chat('What is AI?');

      const startCall = emitSpy.mock.calls.find(c => c[0] === 'session:start');
      expect((startCall?.[1] as any)?.prompt).toBe('What is AI?');
      expect((startCall?.[1] as any)?.sessionId).toBeDefined();
    });

    it('失败时应触发 session:error 和 session:end hooks', async () => {
      const emitSpy = vi.spyOn(agent.context.hookRegistry, 'emit').mockResolvedValue(true);
      const chatCap = (agent as any).chatCap;
      vi.spyOn(chatCap, 'send').mockRejectedValue(new Error('LLM unavailable'));

      await expect(agent.chat('Test')).rejects.toThrow('LLM unavailable');

      const calls = emitSpy.mock.calls.map(c => c[0]);
      expect(calls).toContain('session:start');
      expect(calls).toContain('session:error');
      expect(calls).toContain('session:end');

      const errorCall = emitSpy.mock.calls.find(c => c[0] === 'session:error');
      expect((errorCall?.[1] as any)?.error?.message).toBe('LLM unavailable');

      const endCall = emitSpy.mock.calls.find(c => c[0] === 'session:end');
      expect((endCall?.[1] as any)?.success).toBe(false);
      expect((endCall?.[1] as any)?.reason).toBe('LLM unavailable');
    });

    it('完成后应停止心跳', async () => {
      const timeoutCap = (agent as any)._context.timeoutCap;
      const stopSpy = vi.spyOn(timeoutCap, 'stopHeartbeat');
      const chatCap = (agent as any).chatCap;
      vi.spyOn(chatCap, 'send').mockResolvedValue('Hello!');

      await agent.chat('Test');

      expect(stopSpy).toHaveBeenCalled();
    });
  });


  describe('超时控制', () => {
    it('应使用 executionTimeout 包装 Promise', async () => {
      const timeoutCap = (agent as any)._context.timeoutCap;
      const withTimeoutSpy = vi.spyOn(timeoutCap, 'withTimeout').mockImplementation(
        async (promise) => promise
      );
      const chatCap = (agent as any).chatCap;
      vi.spyOn(chatCap, 'send').mockResolvedValue('Hello!');

      await agent.chat('Test');

      expect(withTimeoutSpy).toHaveBeenCalledWith(
        expect.any(Promise),
        600000, // 默认 executionTimeout
        expect.stringContaining('timed out')
      );
    });

    it('自定义 executionTimeout 应覆盖默认值', async () => {
      const timeoutCap = (agent as any)._context.timeoutCap;
      const withTimeoutSpy = vi.spyOn(timeoutCap, 'withTimeout').mockImplementation(
        async (promise) => promise
      );
      const chatCap = (agent as any).chatCap;
      vi.spyOn(chatCap, 'send').mockResolvedValue('Hello!');

      await agent.chat('Test', { executionTimeout: 30000 });

      expect(withTimeoutSpy).toHaveBeenCalledWith(
        expect.any(Promise),
        30000,
        expect.stringContaining('timed out')
      );
    });
  });
});
