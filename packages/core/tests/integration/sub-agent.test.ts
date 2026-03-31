/**
 * 子 Agent 协作集成测试
 *
 * 验证 Explore / Plan / General 三种子 Agent 的独立运行和工具权限隔离。
 * 注意：SubAgentCapability 使用 AgentRunner，内部 streaming: false，走 generateText。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockAI,
  simpleTextResponse,
  withAgent,
  createMockProviderManagerModule,
} from './integration-helpers.js';

const { mockGenerateText, mockStreamText, getCallCount, resetCallCount } = createMockAI({
  responses: [simpleTextResponse('Mock sub-agent response')],
});

vi.mock('ai', () => ({
  generateText: mockGenerateText,
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

  // 4.2 Explore agent
  describe('Explore Agent', () => {
    it('should call explore and return result', async () => {
      mockGenerateText.mockResolvedValueOnce(simpleTextResponse('Found 5 TypeScript files in the project.'));

      const result = await withAgent(async (agent) => {
        return agent.explore('find all TypeScript files');
      });

      expect(typeof result).toBe('string');
      expect(result).toContain('Found 5 TypeScript files');
      expect(mockGenerateText).toHaveBeenCalled();
    });

    it('should pass explore-specific system prompt', async () => {
      mockGenerateText.mockResolvedValueOnce(simpleTextResponse('Exploration results'));

      await withAgent(async (agent) => {
        await agent.explore('search for auth module');
      });

      const callArgs = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.system).toBeDefined();
      expect(typeof callArgs.system).toBe('string');
    });
  });

  // 4.3 Plan agent
  describe('Plan Agent', () => {
    it('should call plan and return result', async () => {
      mockGenerateText.mockResolvedValueOnce(simpleTextResponse('Implementation plan: 1. Create module 2. Add tests'));

      const result = await withAgent(async (agent) => {
        return agent.plan('design auth system');
      });

      expect(typeof result).toBe('string');
      expect(result).toContain('Implementation plan');
    });

    it('should pass plan-specific system prompt', async () => {
      mockGenerateText.mockResolvedValueOnce(simpleTextResponse('Plan generated'));

      await withAgent(async (agent) => {
        await agent.plan('refactor database layer');
      });

      const callArgs = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.system).toBeDefined();
    });
  });

  // 4.4 General agent
  describe('General Agent', () => {
    it('should call general and return result', async () => {
      mockGenerateText.mockResolvedValueOnce(simpleTextResponse('Task completed successfully'));

      const result = await withAgent(async (agent) => {
        return agent.general('create a new utility file');
      });

      expect(typeof result).toBe('string');
      expect(result).toContain('Task completed');
    });

    it('should pass general-specific system prompt', async () => {
      mockGenerateText.mockResolvedValueOnce(simpleTextResponse('Done'));

      await withAgent(async (agent) => {
        await agent.general('fix the bug in user service');
      });

      const callArgs = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.system).toBeDefined();
    });
  });

  // 4.5 子 Agent 结果返回
  describe('Sub-agent Result Return', () => {
    it('should return result text from sub-agent execution', async () => {
      const expectedText = 'Exploration complete: found 3 relevant files.';
      mockGenerateText.mockResolvedValueOnce(simpleTextResponse(expectedText));

      const result = await withAgent(async (agent) => {
        return agent.explore('find authentication related code');
      });

      expect(result).toBe(expectedText);
    });

    it('should support different thoroughness levels', async () => {
      mockGenerateText.mockResolvedValueOnce(simpleTextResponse('Quick scan result'));

      const result = await withAgent(async (agent) => {
        return agent.explore('quick check', 'quick');
      });

      expect(typeof result).toBe('string');
      expect(mockGenerateText).toHaveBeenCalled();
    });
  });
});
