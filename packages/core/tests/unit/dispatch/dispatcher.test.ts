/**
 * Dispatcher 路由器测试
 *
 * Mock 所有外部依赖，验证路由逻辑。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Dispatcher } from '../../../src/agents/dispatch/Dispatcher.js';
import type { AgentContext, AgentCapability } from '../../../src/agents/core/types.js';

/**
 * 创建 mock capabilities
 */
function createMockCapabilities() {
  return {
    chat: {
      name: 'chat',
      send: vi.fn(async (prompt: string) => `Chat: ${prompt.slice(0, 30)}`),
      initialize: vi.fn(),
    },
    workflow: {
      name: 'workflow',
      run: vi.fn(async (task: string) => ({
        analysis: { type: 'moderate' as const, needsExploration: false, needsPlanning: false, recommendedAgents: [], reason: '' },
        executeResult: { text: `Workflow: ${task.slice(0, 30)}`, tools: [], success: true },
        success: true,
      })),
      initialize: vi.fn(),
    },
  };
}

type MockCapabilities = ReturnType<typeof createMockCapabilities>;

/**
 * 创建 mock AgentContext
 */
function createMockContext(caps: MockCapabilities) {
  const capMap: Record<string, AgentCapability> = {
    chat: caps.chat as unknown as AgentCapability,
    workflow: caps.workflow as unknown as AgentCapability,
  };

  return {
    runner: {
      execute: vi.fn(async (_agent: string, prompt: string) => ({
        text: `Response to: ${prompt.slice(0, 50)}`,
        tools: ['Read', 'Grep'],
        success: true,
        usage: { input: 100, output: 50 },
      })),
    },
    providerManager: {
      getActiveProvider: vi.fn(() => ({ baseUrl: 'https://api.example.com', apiKey: 'test-key' })),
    },
    hookRegistry: {
      getSessionId: vi.fn(() => 'test-session'),
      emit: vi.fn(),
    },
    skillRegistry: { size: 0, match: vi.fn(() => null), generateSkillInstruction: vi.fn(() => '') },
    timeoutCap: { getConfig: () => ({ heartbeatInterval: 30000, stallTimeout: 60000 }), startHeartbeat: vi.fn(), stopHeartbeat: vi.fn() },
    getCapability: vi.fn((name: string) => capMap[name] ?? null),
    getActiveProvider: vi.fn(() => ({ baseUrl: 'https://api.example.com', apiKey: 'test-key' })),
  } as unknown as AgentContext;
}

describe('Dispatcher', () => {
  let dispatcher: Dispatcher;
  let ctx: AgentContext;
  let caps: MockCapabilities;

  beforeEach(() => {
    caps = createMockCapabilities();
    ctx = createMockContext(caps);
    dispatcher = new Dispatcher(ctx);
  });

  describe('forceLayer option', () => {
    it('should skip classification and route to chat', async () => {
      const result = await dispatcher.dispatch('anything', { forceLayer: 'chat' });
      expect(result.layer).toBe('chat');
      expect(result.success).toBe(true);
      expect(caps.chat.send).toHaveBeenCalledWith('anything');
    });

    it('should skip classification and route to workflow', async () => {
      const result = await dispatcher.dispatch('anything', { forceLayer: 'workflow' });
      expect(result.layer).toBe('workflow');
      expect(result.success).toBe(true);
      expect(caps.workflow.run).toHaveBeenCalledWith('anything', expect.any(Object));
    });

    it('should set confidence to 1.0 for forced layer', async () => {
      const result = await dispatcher.dispatch('test', { forceLayer: 'workflow' });
      expect(result.classification.confidence).toBe(1.0);
      expect(result.classification.reason).toContain('Forced layer');
    });

    it('should fallback to chat for invalid forceLayer', async () => {
      const result = await dispatcher.dispatch('test', { forceLayer: 'invalid' as any });
      expect(result.layer).toBe('chat');
      expect(result.classification.confidence).toBe(1.0);
    });
  });

  describe('DispatchResult format', () => {
    it('should have correct result structure', async () => {
      const result = await dispatcher.dispatch('test', { forceLayer: 'chat' });

      expect(result).toHaveProperty('layer');
      expect(result).toHaveProperty('classification');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('duration');
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should include classification details', async () => {
      const result = await dispatcher.dispatch('test', { forceLayer: 'workflow' });

      expect(result.classification).toHaveProperty('layer');
      expect(result.classification).toHaveProperty('taskType');
      expect(result.classification).toHaveProperty('complexity');
      expect(result.classification).toHaveProperty('confidence');
      expect(result.classification).toHaveProperty('reason');
    });
  });

  describe('fallback chain', () => {
    it('should fallback to chat when workflow fails', async () => {
      const failingCaps = createMockCapabilities();
      failingCaps.workflow.run = vi.fn(async () => { throw new Error('Workflow execution failed'); });
      const failingCtx = createMockContext(failingCaps);
      const failingDispatcher = new Dispatcher(failingCtx);

      const result = await failingDispatcher.dispatch('test', { forceLayer: 'workflow' });
      expect(result.layer).toBe('chat');
      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should throw when chat fails with forceLayer=chat', async () => {
      const errorCaps = createMockCapabilities();
      errorCaps.chat.send = vi.fn(async () => { throw new Error('Chat failed'); });
      const errorCtx = createMockContext(errorCaps);
      const errorDispatcher = new Dispatcher(errorCtx);

      await expect(errorDispatcher.dispatch('test', { forceLayer: 'chat' })).rejects.toThrow('Chat failed');
    });

    it('should handle workflow failure gracefully', async () => {
      const errorCaps = createMockCapabilities();
      errorCaps.workflow.run = vi.fn(async () => ({ success: false, error: 'Workflow error', analysis: { type: 'simple' as const, needsExploration: false, needsPlanning: false, recommendedAgents: [], reason: '' } }));
      const errorCtx = createMockContext(errorCaps);
      const errorDispatcher = new Dispatcher(errorCtx);

      const result = await errorDispatcher.dispatch('test', { forceLayer: 'workflow' });
      expect(result.success).toBe(false);
    });
  });

  describe('input validation', () => {
    it('should return error for empty task', async () => {
      const result = await dispatcher.dispatch('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should return error for whitespace-only task', async () => {
      const result = await dispatcher.dispatch('   ');
      expect(result.success).toBe(false);
    });
  });

  describe('capability missing', () => {
    it('should return error when chat capability not available', async () => {
      const noCapCtx = createMockContext(createMockCapabilities());
      noCapCtx.getCapability = vi.fn(() => null);
      const noCapDispatcher = new Dispatcher(noCapCtx);

      const result = await noCapDispatcher.dispatch('test', { forceLayer: 'chat' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should return error when workflow capability not available', async () => {
      const noCapCtx = createMockContext(createMockCapabilities());
      noCapCtx.getCapability = vi.fn(() => null);
      const noCapDispatcher = new Dispatcher(noCapCtx);

      const result = await noCapDispatcher.dispatch('test', { forceLayer: 'workflow' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });
  });
});
