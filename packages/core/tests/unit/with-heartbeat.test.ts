/**
 * 7.4 withHeartbeat() 重构测试
 *
 * 验证 chat/chatStream 心跳行为一致
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
      expect(sessionEndCall?.[1].success).toBe(true);
    });

    it('session:start 应包含 prompt 和 sessionId', async () => {
      const emitSpy = vi.spyOn(agent.context.hookRegistry, 'emit').mockResolvedValue(true);
      const chatCap = (agent as any).chatCap;
      vi.spyOn(chatCap, 'send').mockResolvedValue('Hello!');

      await agent.chat('What is AI?');

      const startCall = emitSpy.mock.calls.find(c => c[0] === 'session:start');
      expect(startCall?.[1].prompt).toBe('What is AI?');
      expect(startCall?.[1].sessionId).toBeDefined();
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
      expect(errorCall?.[1].error.message).toBe('LLM unavailable');

      const endCall = emitSpy.mock.calls.find(c => c[0] === 'session:end');
      expect(endCall?.[1].success).toBe(false);
      expect(endCall?.[1].reason).toBe('LLM unavailable');
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

  describe('chatStream() 心跳行为', () => {
    it('成功时应触发 session:start 和 session:end hooks', async () => {
      const emitSpy = vi.spyOn(agent.context.hookRegistry, 'emit').mockResolvedValue(true);
      const chatCap = (agent as any).chatCap;
      vi.spyOn(chatCap, 'sendStream').mockResolvedValue(undefined);

      await agent.chatStream('Test prompt');

      const calls = emitSpy.mock.calls.map(c => c[0]);
      expect(calls).toContain('session:start');
      expect(calls).toContain('session:end');

      const sessionEndCall = emitSpy.mock.calls.find(c => c[0] === 'session:end');
      expect(sessionEndCall?.[1].success).toBe(true);
    });

    it('失败时应触发 session:error 和 session:end hooks', async () => {
      const emitSpy = vi.spyOn(agent.context.hookRegistry, 'emit').mockResolvedValue(true);
      const chatCap = (agent as any).chatCap;
      vi.spyOn(chatCap, 'sendStream').mockRejectedValue(new Error('Stream error'));

      await expect(agent.chatStream('Test')).rejects.toThrow('Stream error');

      const calls = emitSpy.mock.calls.map(c => c[0]);
      expect(calls).toContain('session:error');
      expect(calls).toContain('session:end');

      const endCall = emitSpy.mock.calls.find(c => c[0] === 'session:end');
      expect(endCall?.[1].success).toBe(false);
    });

    it('完成后应停止心跳', async () => {
      const timeoutCap = (agent as any)._context.timeoutCap;
      const stopSpy = vi.spyOn(timeoutCap, 'stopHeartbeat');
      const chatCap = (agent as any).chatCap;
      vi.spyOn(chatCap, 'sendStream').mockResolvedValue(undefined);

      await agent.chatStream('Test');

      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('chat/chatStream 一致性', () => {
    it('两者都应在成功时触发相同的 hooks 顺序', async () => {
      // 测试 chat
      const chatEmitSpy = vi.spyOn(agent.context.hookRegistry, 'emit').mockResolvedValue(true);
      const chatCap = (agent as any).chatCap;
      vi.spyOn(chatCap, 'send').mockResolvedValue('Hello!');
      await agent.chat('Test');

      const chatHookTypes = chatEmitSpy.mock.calls.map(c => c[0]);
      chatEmitSpy.mockClear();

      // 测试 chatStream
      vi.spyOn(chatCap, 'sendStream').mockResolvedValue(undefined);
      await agent.chatStream('Test');

      const streamHookTypes = chatEmitSpy.mock.calls.map(c => c[0]);

      // 成功路径都应该是: session:start -> session:end
      expect(chatHookTypes).toEqual(streamHookTypes);
      expect(chatHookTypes).toEqual(['session:start', 'session:end']);
    });

    it('两者都应在失败时触发相同的 hooks 顺序', async () => {
      // 测试 chat 失败
      const emitSpy = vi.spyOn(agent.context.hookRegistry, 'emit').mockResolvedValue(true);
      const chatCap = (agent as any).chatCap;

      vi.spyOn(chatCap, 'send').mockRejectedValue(new Error('fail'));
      await expect(agent.chat('Test')).rejects.toThrow();

      const chatHookTypes = emitSpy.mock.calls.map(c => c[0]);
      emitSpy.mockClear();

      // 测试 chatStream 失败
      vi.spyOn(chatCap, 'sendStream').mockRejectedValue(new Error('fail'));
      await expect(agent.chatStream('Test')).rejects.toThrow();

      const streamHookTypes = emitSpy.mock.calls.map(c => c[0]);

      // 失败路径都应该是: session:start -> session:error -> session:end
      expect(chatHookTypes).toEqual(streamHookTypes);
      expect(chatHookTypes).toEqual(['session:start', 'session:error', 'session:end']);
    });

    it('两者都应启动和停止心跳', async () => {
      const timeoutCap = (agent as any)._context.timeoutCap;
      const startSpy = vi.spyOn(timeoutCap, 'startHeartbeat');
      const stopSpy = vi.spyOn(timeoutCap, 'stopHeartbeat');
      const chatCap = (agent as any).chatCap;

      // chat
      vi.spyOn(chatCap, 'send').mockResolvedValue('Hello!');
      await agent.chat('Test');
      expect(startSpy).toHaveBeenCalledTimes(1);
      // startHeartbeat 内部先调 stopHeartbeat，finally 再调一次 = 2次
      expect(stopSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

      startSpy.mockClear();
      stopSpy.mockClear();

      // chatStream
      vi.spyOn(chatCap, 'sendStream').mockResolvedValue(undefined);
      await agent.chatStream('Test');
      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(stopSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
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
