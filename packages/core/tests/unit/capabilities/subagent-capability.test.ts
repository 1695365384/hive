/**
 * SubAgentCapability 单元测试
 *
 * 测试子 Agent 能力
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubAgentCapability } from '../../../src/agents/capabilities/SubAgentCapability.js';
import {
  createMockAgentContext,
  createTestProviderConfig,
} from '../../mocks/agent-context.mock.js';
import type { AgentContext, AgentResult } from '../../../src/agents/core/types.js';

describe('SubAgentCapability', () => {
  let capability: SubAgentCapability;
  let context: AgentContext;

  const testProvider = createTestProviderConfig({
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'test-api-key',
    model: 'deepseek-chat',
  });

  const mockAgentResult: AgentResult = {
    text: 'Agent completed successfully',
    success: true,
    tools: ['Read', 'Write'],
    usage: { input: 100, output: 50 },
  };

  beforeEach(() => {
    capability = new SubAgentCapability();
    context = createMockAgentContext({
      activeProvider: testProvider,
      providers: [testProvider],
    });
    vi.mocked(context.runner.execute).mockResolvedValue(mockAgentResult);
    capability.initialize(context);
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('生命周期', () => {
    it('should initialize correctly', () => {
      expect(capability.name).toBe('subAgent');
    });

    it('should have correct name', () => {
      expect(capability.name).toBe('subAgent');
    });
  });

  // ============================================
  // setParentSessionId() 测试
  // ============================================

  describe('setParentSessionId()', () => {
    it('should set parent session ID', () => {
      capability.setParentSessionId('parent-session-123');
      // 验证不会抛出错误
    });
  });

  // ============================================
  // explore() 测试
  // ============================================

  describe('explore()', () => {
    it('should explore codebase', async () => {
      const result = await capability.explore('Find all API endpoints');

      expect(result).toBe('Agent completed successfully');
      expect(context.runner.execute).toHaveBeenCalledWith(
        'explore',
        expect.stringContaining('Find all API endpoints'),
        undefined,
      );
    });

    it('should use default thoroughness level', async () => {
      await capability.explore('Find all API endpoints');

      const callArgs = vi.mocked(context.runner.execute).mock.calls[0];
      // 实际 prompt 使用 THOROUGHNESS_PROMPTS['medium']
      expect(callArgs[1]).toContain('balanced exploration');
    });

    it('should support quick thoroughness', async () => {
      await capability.explore('Find files', 'quick');

      const callArgs = vi.mocked(context.runner.execute).mock.calls[0];
      expect(callArgs[1]).toContain('quick search');
    });

    it('should support very thorough level', async () => {
      await capability.explore('Deep analysis', 'very-thorough');

      const callArgs = vi.mocked(context.runner.execute).mock.calls[0];
      // 实际 prompt 使用 THOROUGHNESS_PROMPTS['very-thorough']
      expect(callArgs[1]).toContain('comprehensive analysis');
    });

    it('should pass options through', async () => {
      await capability.explore('Find files', 'medium', { tools: ['Read', 'Glob'] });

      expect(context.runner.execute).toHaveBeenCalledWith(
        'explore',
        expect.any(String),
        expect.objectContaining({
          tools: ['Read', 'Glob'],
        })
      );
    });

    it('should allow custom tools to override defaults', async () => {
      await capability.explore('Find files', 'medium', { tools: ['Read', 'Glob'] });

      expect(context.runner.execute).toHaveBeenCalledWith(
        'explore',
        expect.any(String),
        expect.objectContaining({
          tools: ['Read', 'Glob'],
        })
      );
    });

    it('should trigger agent:spawn hook', async () => {
      await capability.explore('Find files');

      expect(context.hookRegistry.emit).toHaveBeenCalledWith(
        'agent:spawn',
        expect.objectContaining({
          agentName: 'explore',
        })
      );
    });

    it('should trigger agent:complete hook on success', async () => {
      await capability.explore('Find files');

      expect(context.hookRegistry.emit).toHaveBeenCalledWith(
        'agent:complete',
        expect.objectContaining({
          agentName: 'explore',
          success: true,
        })
      );
    });
  });

  // ============================================
  // plan() 测试
  // ============================================

  describe('plan()', () => {
    it('should plan implementation', async () => {
      const result = await capability.plan('Implement user authentication');

      expect(result).toBe('Agent completed successfully');
      expect(context.runner.execute).toHaveBeenCalledWith(
        'plan',
        expect.stringContaining('Implement user authentication'),
        undefined,
      );
    });

    it('should pass options through for plan', async () => {
      await capability.plan('Plan feature', { tools: ['Read'] });

      expect(context.runner.execute).toHaveBeenCalledWith(
        'plan',
        expect.any(String),
        expect.objectContaining({
          tools: ['Read'],
        })
      );
    });

    it('should allow custom tools to override defaults', async () => {
      await capability.plan('Plan feature', { tools: ['Read'] });

      expect(context.runner.execute).toHaveBeenCalledWith(
        'plan',
        expect.any(String),
        expect.objectContaining({
          tools: ['Read'],
        })
      );
    });

    it('should trigger agent:spawn hook', async () => {
      await capability.plan('Plan feature');

      expect(context.hookRegistry.emit).toHaveBeenCalledWith(
        'agent:spawn',
        expect.objectContaining({
          agentName: 'plan',
        })
      );
    });
  });

  // ============================================
  // general() 测试
  // ============================================

  describe('general()', () => {
    it('should execute general task', async () => {
      const result = await capability.general('Write a function to sort array');

      expect(result).toBe('Agent completed successfully');
      expect(context.runner.execute).toHaveBeenCalledWith(
        'general',
        'Write a function to sort array',
        undefined
      );
    });

    it('should trigger agent:spawn hook', async () => {
      await capability.general('Task');

      expect(context.hookRegistry.emit).toHaveBeenCalledWith(
        'agent:spawn',
        expect.objectContaining({
          agentName: 'general',
        })
      );
    });
  });

  // ============================================
  // run() 测试
  // ============================================

  describe('run()', () => {
    it('should run specified agent', async () => {
      const result = await capability.run('general', 'Test task');

      expect(result).toEqual(mockAgentResult);
      expect(context.runner.execute).toHaveBeenCalledWith('general', 'Test task', undefined);
    });

    it('should return full AgentResult', async () => {
      const result = await capability.run('explore', 'Find files');

      expect(result.text).toBe('Agent completed successfully');
      expect(result.success).toBe(true);
      expect(result.tools).toEqual(['Read', 'Write']);
      expect(result.usage).toEqual({ input: 100, output: 50 });
    });

    it('should pass custom options to runner', async () => {
      await capability.run('general', 'Test task', { tools: ['Read', 'Write'] });

      expect(context.runner.execute).toHaveBeenCalledWith(
        'general',
        'Test task',
        expect.objectContaining({ tools: ['Read', 'Write'] })
      );
    });
  });

  // ============================================
  // 错误处理测试
  // ============================================

  describe('错误处理', () => {
    it('should handle runner errors', async () => {
      vi.mocked(context.runner.execute).mockRejectedValue(new Error('Runner failed'));

      await expect(capability.explore('Test')).rejects.toThrow('Runner failed');
    });

    it('should trigger agent:complete hook on failure', async () => {
      vi.mocked(context.runner.execute).mockRejectedValue(new Error('Failed'));

      try {
        await capability.explore('Test');
      } catch {
        // 预期会抛出错误
      }

      expect(context.hookRegistry.emit).toHaveBeenCalledWith(
        'agent:complete',
        expect.objectContaining({
          success: false,
          error: expect.any(Error),
        })
      );
    });

    it('should include duration in agent:complete hook', async () => {
      await capability.explore('Test');

      expect(context.hookRegistry.emit).toHaveBeenCalledWith(
        'agent:complete',
        expect.objectContaining({
          duration: expect.any(Number),
        })
      );
    });
  });

  // ============================================
  // Hook 触发测试
  // ============================================

  describe('Hook 触发', () => {
    it('should include parent session ID in spawn hook', async () => {
      capability.setParentSessionId('parent-123');
      await capability.explore('Test');

      expect(context.hookRegistry.emit).toHaveBeenCalledWith(
        'agent:spawn',
        expect.objectContaining({
          parentSessionId: 'parent-123',
        })
      );
    });

    it('should include result summary in complete hook', async () => {
      await capability.explore('Test');

      expect(context.hookRegistry.emit).toHaveBeenCalledWith(
        'agent:complete',
        expect.objectContaining({
          resultSummary: expect.any(String),
        })
      );
    });
  });
});
