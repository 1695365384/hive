/**
 * CoordinatorCapability 执行测试
 *
 * 验证 dispatch/chat 执行行为
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Agent } from '../../src/agents/core/Agent.js';

describe('Agent dispatch/chat', () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('dispatch() 行为', () => {
    it('dispatch() should delegate to coordinatorCap.run() and return full DispatchResult', async () => {
      const coordinatorCap = (agent as any).coordinatorCap;
      vi.spyOn(coordinatorCap, 'run').mockResolvedValue({
        text: 'Hello!',
        success: true,
        duration: 100,
        tools: [],
      });

      const result = await agent.dispatch('Test prompt');

      expect(result.text).toBe('Hello!');
      expect(result.success).toBe(true);
      expect(coordinatorCap.run).toHaveBeenCalledWith('Test prompt', undefined);
    });

    it('dispatch() should pass options to coordinatorCap.run()', async () => {
      const coordinatorCap = (agent as any).coordinatorCap;
      vi.spyOn(coordinatorCap, 'run').mockResolvedValue({
        text: 'result',
        success: true,
        duration: 100,
        tools: [],
      });

      await agent.dispatch('Test', { sessionId: 'test-session' });

      expect(coordinatorCap.run).toHaveBeenCalledWith('Test', { sessionId: 'test-session' });
    });

    it('dispatch() should return DispatchResult with error on failure', async () => {
      const coordinatorCap = (agent as any).coordinatorCap;
      vi.spyOn(coordinatorCap, 'run').mockResolvedValue({
        text: '',
        success: false,
        duration: 100,
        tools: [],
        error: 'Something went wrong',
      });

      const result = await agent.dispatch('Test');

      expect(result.text).toBe('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Something went wrong');
    });

    it('dispatch() should return full DispatchResult', async () => {
      const coordinatorCap = (agent as any).coordinatorCap;
      vi.spyOn(coordinatorCap, 'run').mockResolvedValue({
        text: 'Response',
        success: true,
        duration: 200,
        tools: ['agent', 'task-stop', 'send-message'],
        usage: { input: 100, output: 50 },
        cost: { input: 0.0003, output: 0.00075, total: 0.00105 },
      });

      const result = await agent.dispatch('Test task');

      expect(result.text).toBe('Response');
      expect(result.success).toBe(true);
      expect(result.tools).toEqual(['agent', 'task-stop', 'send-message']);
      expect(result.usage).toBeDefined();
      expect(result.cost).toBeDefined();
    });
  });

  describe('已删除方法', () => {
    it('Agent should not have explore method', () => {
      expect((agent as any).explore).toBeUndefined();
    });

    it('Agent should not have plan method', () => {
      expect((agent as any).plan).toBeUndefined();
    });

    it('Agent should not have general method', () => {
      expect((agent as any).general).toBeUndefined();
    });

    it('Agent should not have runSubAgent method', () => {
      expect((agent as any).runSubAgent).toBeUndefined();
    });

    it('Agent should not have runWorkflow method', () => {
      expect((agent as any).runWorkflow).toBeUndefined();
    });
  });

  describe('taskManager', () => {
    it('Agent should expose taskManager getter', () => {
      const tm = agent.taskManager;
      expect(tm).toBeDefined();
      expect(tm.register).toBeDefined();
      expect(tm.abort).toBeDefined();
      expect(tm.abortAll).toBeDefined();
    });
  });
});
