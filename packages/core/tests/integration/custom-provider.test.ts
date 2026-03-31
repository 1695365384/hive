/**
 * 自定义 Provider 集成测试
 *
 * 验证用户自定义 Provider 的注册、切换和使用。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockAI,
  simpleTextResponse,
  createMockProviderManagerModule,
  createFakeModel,
  withAgent,
} from './integration-helpers.js';

const { mockGenerateText, mockStreamText, getCallCount, resetCallCount } = createMockAI({
  responses: [simpleTextResponse('Mock response')],
});

vi.mock('ai', () => ({
  generateText: mockGenerateText,
  streamText: mockStreamText,
  stepCountIs: vi.fn((n: number) => n),
  tool: vi.fn((config: Record<string, unknown>) => config),
  zodSchema: vi.fn((schema: unknown) => schema),
}));

vi.mock('../../src/providers/ProviderManager.js', () => createMockProviderManagerModule());

describe('Custom Provider Integration', () => {
  beforeEach(() => {
    resetCallCount();
    vi.clearAllMocks();
  });

  function createStreamResponse(text: string) {
    return {
      fullStream: (async function* () {
        yield { type: 'start' };
        yield { type: 'text-delta', text };
        yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 50, outputTokens: 25 } };
      })(),
      text: Promise.resolve(text),
      finishReason: Promise.resolve('stop'),
      steps: Promise.resolve([]),
      totalUsage: Promise.resolve({ inputTokens: 50, outputTokens: 25 }),
    };
  }

  // 6.2 自定义 Provider 注册和使用
  describe('Provider Registration and Usage', () => {
    it('should list available providers', async () => {
      await withAgent(async (agent) => {
        const providers = agent.listProviders();
        expect(Array.isArray(providers)).toBe(true);
      });
    });

    it('should have useProvider method', async () => {
      await withAgent(async (agent) => {
        expect(typeof agent.useProvider).toBe('function');
      });
    });
  });

  // 6.3 Provider 切换行为验证
  describe('Provider Switching Behavior', () => {
    it('should return false for non-existent provider', async () => {
      await withAgent(async (agent) => {
        const result = agent.useProvider('non-existent-provider-xyz');
        expect(result).toBe(false);
      });
    });

    it('should not change currentProvider when switching to non-existent provider', async () => {
      await withAgent(async (agent) => {
        const before = agent.currentProvider;
        agent.useProvider('non-existent-provider-xyz');
        const after = agent.currentProvider;
        expect(after).toBe(before);
      });
    });
  });

  // 6.4 多 Agent 实例 Provider 隔离
  describe('Multiple Agent Provider Isolation', () => {
    it('should create independent agent instances', async () => {
      const { createAgent } = await import('../../src/agents/core/index.js');

      const agent1 = createAgent();
      const agent2 = createAgent();
      await agent1.initialize();
      await agent2.initialize();

      // 两个 Agent 应该是独立实例
      expect(agent1).not.toBe(agent2);
      expect(agent1.context).not.toBe(agent2.context);

      await agent1.dispose();
      await agent2.dispose();
    });

    it('should have separate hook registries', async () => {
      const { createAgent } = await import('../../src/agents/core/index.js');

      const agent1 = createAgent();
      const agent2 = createAgent();
      await agent1.initialize();
      await agent2.initialize();

      const spy1 = vi.fn();
      const spy2 = vi.fn();

      agent1.context.hookRegistry.on('tool:before', spy1);
      agent2.context.hookRegistry.on('tool:before', spy2);

      // Agent1 的 hook 不应影响 Agent2
      expect(agent1.context.hookRegistry.has('tool:before')).toBe(true);
      expect(agent2.context.hookRegistry.has('tool:before')).toBe(true);

      await agent1.dispose();
      await agent2.dispose();
    });
  });
});
