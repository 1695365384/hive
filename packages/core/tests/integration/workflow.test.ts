/**
 * 工作流引擎集成测试
 *
 * 验证 AgentLoop(dispatch) 主路径在 pi kernel 下的基础行为。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  withAgent,
  createMockProviderManagerModule,
} from './integration-helpers.js';

const { piSession } = vi.hoisted(() => {
  const queue: Array<{ text: string; tools?: string[]; success?: boolean; error?: string }> = [
    { text: 'Mock workflow response' },
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

describe('Workflow Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    piSession.resetCallCount();
    piSession.setResponses([{ text: 'Mock workflow response' }]);
  });

  describe('Basic Workflow Execution', () => {
    it('should run dispatch and return DispatchResult', async () => {
      piSession.setResponses([{ text: 'Workflow completed successfully' }]);
      const result = await withAgent(async (agent) => {
        return agent.dispatch('implement user auth');
      });
      expect(typeof result).toBe('object');
      expect('text' in result).toBe(true);
      expect(result.text).toContain('Workflow completed successfully');
    });
  });

  describe.skip('Workflow Phase Hooks', () => {
    it('placeholder', () => {
      expect(true).toBe(true);
    });
  });

  describe('Workflow Tool Calls', () => {
    it('should handle tool calls within dispatch', async () => {
      piSession.setResponses([
        { text: 'Analysis done', tools: ['bash', 'read'] },
      ]);
      const result = await withAgent(async (agent) => {
        return agent.dispatch('analyze codebase');
      });
      expect(result.success).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);
    });
  });

  describe('Workflow MaxTurns', () => {
    it('should accept maxTurns option without failing', async () => {
      piSession.setResponses([{ text: 'ok' }]);
      const result = await withAgent(async (agent) => {
        return agent.dispatch('test', { maxTurns: 2 });
      });
      expect(result.text).toBe('ok');
      expect(piSession.runWithPiAgentSession).toHaveBeenCalled();
    });
  });
});
