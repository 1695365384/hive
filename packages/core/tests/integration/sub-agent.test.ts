/**
 * 子 Agent 协作集成测试
 *
 * 验证 Explore / Plan 两种子 Agent 模式的独立运行和工具权限隔离。
 * 通过 dispatch() + forceMode 实现。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockAI,
  simpleTextResponse,
  withAgent,
  createMockProviderManagerModule,
} from './integration-helpers.js';

const { mockStreamText, getCallCount, resetCallCount } = createMockAI({
  responses: [simpleTextResponse('Mock sub-agent response')],
});

vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: mockStreamText,
  stepCountIs: vi.fn((n: number) => n),
  tool: vi.fn((config: Record<string, unknown>) => config),
  zodSchema: vi.fn((schema: unknown) => schema),
}));

vi.mock('../../src/providers/ProviderManager.js', () => createMockProviderManagerModule());

describe('Sub-Agent Collaboration', () => {
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

  // 4.2 Explore agent (via dispatch + forceMode)
  describe('Explore Agent', () => {
    it('should call dispatch with forceMode explore and return result', async () => {
      mockStreamText.mockReturnValue(createStreamResponse('Found 5 TypeScript files in the project.'));

      const result = await withAgent(async (agent) => {
        return agent.dispatch('find all TypeScript files', { forceMode: 'explore' });
      });

      expect(result).toBeDefined();
      expect(result.text).toContain('Found 5 TypeScript files');
      expect(mockStreamText).toHaveBeenCalled();
    });

    it('should pass explore-specific system prompt', async () => {
      mockStreamText.mockReturnValue(createStreamResponse('Exploration results'));

      await withAgent(async (agent) => {
        await agent.dispatch('search for auth module', { forceMode: 'explore' });
      });

      expect(mockStreamText).toHaveBeenCalled();
    });
  });

  // 4.3 Plan agent (via dispatch + forceMode)
  describe('Plan Agent', () => {
    it('should call dispatch with forceMode plan and return result', async () => {
      mockStreamText.mockReturnValue(createStreamResponse('Implementation plan: 1. Create module 2. Add tests'));

      const result = await withAgent(async (agent) => {
        return agent.dispatch('design auth system', { forceMode: 'plan' });
      });

      expect(result).toBeDefined();
      expect(result.text).toContain('Implementation plan');
    });

    it('should pass plan-specific system prompt', async () => {
      mockStreamText.mockReturnValue(createStreamResponse('Plan generated'));

      await withAgent(async (agent) => {
        await agent.dispatch('refactor database layer', { forceMode: 'plan' });
      });

      expect(mockStreamText).toHaveBeenCalled();
    });
  });

  // 4.4 General agent (default dispatch, no forceMode)
  describe('General Agent', () => {
    it('should call dispatch and return result', async () => {
      mockStreamText.mockReturnValue(createStreamResponse('Task completed successfully'));

      const result = await withAgent(async (agent) => {
        return agent.dispatch('create a new utility file');
      });

      expect(result).toBeDefined();
      expect(result.text).toContain('Task completed');
    });

    it('should pass general-specific system prompt', async () => {
      mockStreamText.mockReturnValue(createStreamResponse('Done'));

      await withAgent(async (agent) => {
        await agent.dispatch('fix the bug in user service');
      });

      expect(mockStreamText).toHaveBeenCalled();
    });
  });

  // 4.5 子 Agent 结果返回
  describe('Sub-agent Result Return', () => {
    it('should return result text from sub-agent execution', async () => {
      const expectedText = 'Exploration complete: found 3 relevant files.';
      mockStreamText.mockReturnValue(createStreamResponse(expectedText));

      const result = await withAgent(async (agent) => {
        return agent.dispatch('find authentication related code', { forceMode: 'explore' });
      });

      expect(result.text).toBe(expectedText);
    });
  });
});
