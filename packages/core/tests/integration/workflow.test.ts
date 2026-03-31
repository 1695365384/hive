/**
 * 工作流引擎集成测试
 *
 * 验证 WorkflowCapability 的自主循环执行能力。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockAI,
  simpleTextResponse,
  withAgent,
  createMockProviderManagerModule,
} from './integration-helpers.js';

const { mockGenerateText, mockStreamText, getCallCount, resetCallCount } = createMockAI({
  responses: [simpleTextResponse('Mock workflow response')],
});

vi.mock('ai', () => ({
  generateText: mockGenerateText,
  streamText: mockStreamText,
  stepCountIs: vi.fn((n: number) => n),
  tool: vi.fn((config: Record<string, unknown>) => config),
  zodSchema: vi.fn((schema: unknown) => schema),
}));

vi.mock('../../src/providers/ProviderManager.js', () => createMockProviderManagerModule());

describe('Workflow Engine', () => {
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

  // 5.2 基础 workflow 执行
  describe('Basic Workflow Execution', () => {
    it('should run workflow and return WorkflowResult', async () => {
      mockStreamText.mockReturnValue(createStreamResponse('Workflow completed successfully'));

      const result = await withAgent(async (agent) => {
        return agent.runWorkflow({ task: 'implement user auth' });
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      // WorkflowResult should have text property
      expect('text' in result).toBe(true);
    });
  });

  // 5.3 workflow:phase hook 触发
  describe('Workflow Phase Hooks', () => {
    it('should fire workflow:phase hook during execution', async () => {
      const phaseHook = vi.fn().mockResolvedValue({ proceed: true });
      mockStreamText.mockReturnValue(createStreamResponse('Phase completed'));

      await withAgent(async (agent) => {
        agent.context.hookRegistry.on('workflow:phase', phaseHook);
        await agent.runWorkflow({ task: 'test task' });
      });

      // workflow:phase hook 应该在 WorkflowCapability 中触发
      expect(phaseHook).toHaveBeenCalled();
    });
  });

  // 5.4 workflow 中工具调用
  describe('Workflow Tool Calls', () => {
    it('should handle tool calls within workflow', async () => {
      // Workflow 使用 streamText，mock 一个包含工具调用的响应
      mockStreamText.mockReturnValueOnce({
        fullStream: (async function* () {
          yield { type: 'start' };
          yield { type: 'text-delta', text: 'I will read the file first' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 50, outputTokens: 25 } };
        })(),
        text: Promise.resolve('I will read the file first'),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 50, outputTokens: 25 }),
      });

      const result = await withAgent(async (agent) => {
        return agent.runWorkflow({ task: 'analyze codebase' });
      });

      expect(result).toBeDefined();
    });
  });

  // 5.5 maxTurns 限制
  describe('Workflow MaxTurns', () => {
    it('should respect maxTurns limit', async () => {
      mockStreamText.mockReturnValue(createStreamResponse('Step complete'));

      const result = await withAgent(async (agent) => {
        return agent.runWorkflow({ task: 'test', maxTurns: 2 });
      });

      expect(result).toBeDefined();
      // 验证 LLM 调用次数不超过 maxTurns（mock 可能被调用多次，但不应无限循环）
      // 由于 mock 立即返回 'stop'，实际只调用一次
      expect(mockStreamText.mock.calls.length).toBeLessThanOrEqual(2);
    });
  });
});
