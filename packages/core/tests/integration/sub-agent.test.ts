/**
 * 子 Agent 协作集成测试
 *
 * forceMode 等旧 Coordinator 语义已移除；此处验证 dispatch 主路径在 pi mock 下可返回结果。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  withAgent,
  createMockProviderManagerModule,
} from './integration-helpers.js';

const { piSession } = vi.hoisted(() => {
  const queue: Array<{ text: string; tools?: string[]; success?: boolean; error?: string }> = [
    { text: 'Mock sub-agent response' },
  ];
  let callCount = 0;
  const runWithPiAgentSession = vi.fn(async (input: any) => {
    callCount += 1;
    const next = queue.shift() ?? { text: 'Mock response' };
    input.options?.onPhase?.('execute', '');
    if (next.text) input.options?.onText?.(next.text);
    for (const tool of next.tools ?? []) {
      input.options?.onTool?.(tool, {});
      input.options?.onToolResult?.(tool, 'ok');
    }
    const success = next.success !== false && !next.error;
    input.options?.onTaskProgress?.(
      success ? { phase: 'done' } : { phase: 'blocked', message: next.error ?? 'blocked' },
    );
    return {
      text: next.text ?? '',
      finalText: next.text ?? '',
      success,
      duration: 1,
      tools: next.tools ?? [],
      error: next.error,
      verification: { passed: true, results: [] },
    };
  });
  return {
    piSession: {
      runWithPiAgentSession,
      mapPiSessionEventToDispatch: vi.fn(),
      setResponses(responses: Array<{ text: string; tools?: string[]; success?: boolean; error?: string }>) {
        queue.length = 0;
        queue.push(...responses);
      },
      getCallCount: () => callCount,
      resetCallCount: () => {
        callCount = 0;
      },
    },
  };
});

vi.mock('../../src/agents/core/PiAgentSessionAdapter.js', () => ({
  runWithPiAgentSession: (...args: unknown[]) => (piSession.runWithPiAgentSession as any)(...args),
  mapPiSessionEventToDispatch: piSession.mapPiSessionEventToDispatch,
}));


vi.mock('../../src/providers/ProviderManager.js', () => createMockProviderManagerModule());

describe('Sub-Agent Collaboration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    piSession.resetCallCount();
    piSession.setResponses([{ text: 'Mock sub-agent response' }]);
  });

  describe('Explore Agent', () => {
    it('should call dispatch and return result', async () => {
      piSession.setResponses([{ text: 'Found 5 TypeScript files' }]);
      const result = await withAgent(async (agent) => agent.dispatch('find ts files'));
      expect(result).toBeDefined();
      expect(result.text).toContain('Found 5 TypeScript files');
      expect(piSession.runWithPiAgentSession).toHaveBeenCalled();
    });

    it('should pass task into pi session', async () => {
      piSession.setResponses([{ text: 'explore done' }]);
      await withAgent(async (agent) => {
        await agent.dispatch('explore src');
      });
      const callArgs = piSession.runWithPiAgentSession.mock.calls[0][0] as { task: string };
      expect(callArgs.task).toBe('explore src');
    });
  });

  describe('Plan Agent', () => {
    it('should call dispatch and return result', async () => {
      piSession.setResponses([{ text: 'Implementation plan' }]);
      const result = await withAgent(async (agent) => agent.dispatch('plan auth'));
      expect(result).toBeDefined();
      expect(result.text).toContain('Implementation plan');
    });

    it('should pass task into pi session', async () => {
      piSession.setResponses([{ text: 'plan done' }]);
      await withAgent(async (agent) => {
        await agent.dispatch('plan feature');
      });
      expect(piSession.runWithPiAgentSession).toHaveBeenCalled();
    });
  });

  describe('General Agent', () => {
    it('should call dispatch and return result', async () => {
      piSession.setResponses([{ text: 'Task completed' }]);
      const result = await withAgent(async (agent) => agent.dispatch('do work'));
      expect(result).toBeDefined();
      expect(result.text).toContain('Task completed');
    });

    it('should pass task into pi session', async () => {
      piSession.setResponses([{ text: 'general done' }]);
      await withAgent(async (agent) => {
        await agent.dispatch('general task');
      });
      expect(piSession.runWithPiAgentSession).toHaveBeenCalled();
    });
  });

  describe('Sub-agent Result Return', () => {
    it('should return result text from sub-agent execution', async () => {
      const expectedText = 'Exploration complete: found 3 relevant files.';
      piSession.setResponses([{ text: expectedText }]);
      const result = await withAgent(async (agent) => agent.dispatch('explore'));
      expect(result.text).toBe(expectedText);
    });
  });
});
