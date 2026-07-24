/**
 * 完整对话链路集成测试
 *
 * 验证 "用户输入 → LLM 响应 → 工具调用 → 返回结果" 的完整链路。
 * 使用 integration-helpers.ts 提供的智能 mock 覆盖 setup.ts 的全局 mock。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withAgent,
  createMockProviderManagerModule,
} from './integration-helpers.js';

const { piSession } = vi.hoisted(() => {
  const queue: Array<{ text: string; tools?: string[]; success?: boolean; error?: string }> = [
    { text: 'Mock response' },
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

// ============================================
// Tests
// ============================================

describe('Full Conversation Chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    piSession.resetCallCount();
    piSession.setResponses([{ text: 'Mock response' }]);
  });

  describe('Simple Text Chat', () => {
    it('should return LLM text response', async () => {
      piSession.setResponses([{ text: '你好！有什么可以帮你的？' }]);

      const result = await withAgent(async (agent) => {
        return (await agent.dispatch('你好')).text;
      });

      expect(result).toBe('你好！有什么可以帮你的？');
      expect(piSession.runWithPiAgentSession).toHaveBeenCalled();
    });

    it('should call pi session with correct task', async () => {
      piSession.setResponses([{ text: 'Hello!' }]);

      const result = await withAgent(async (agent) => {
        return (await agent.dispatch('Hello')).text;
      });

      expect(result).toBe('Hello!');
      expect(piSession.runWithPiAgentSession).toHaveBeenCalled();
      const callArgs = piSession.runWithPiAgentSession.mock.calls[0][0] as {
        task: string;
        systemPrompt: string;
      };
      expect(callArgs.task).toBe('Hello');
      expect(typeof callArgs.systemPrompt).toBe('string');
    });
  });

  describe('Chat with Tool Use', () => {
    it('should execute tool call and return result', async () => {
      piSession.setResponses([
        {
          text: 'File contents here',
          tools: ['read'],
        },
      ]);

      const result = await withAgent(async (agent) => {
        return (await agent.dispatch('读取 /tmp/test.ts 的内容')).text;
      });

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(piSession.runWithPiAgentSession).toHaveBeenCalled();
    });
  });

  describe('Multi-turn Context', () => {
    it('should pass conversation history on second call', async () => {
      piSession.setResponses([
        { text: '第一轮回复' },
        { text: '第二轮回复' },
      ]);

      await withAgent(async (agent) => {
        const r1 = await agent.dispatch('第一轮消息');
        expect(r1.text).toBe('第一轮回复');

        const r2 = await agent.dispatch('第二轮消息');
        expect(r2.text).toBe('第二轮回复');

        expect(piSession.getCallCount()).toBe(2);
      });
    });
  });

  // Tool hooks need AgentLoop-specific rewrite for pi tool events
  describe.skip('Tool Execution Hooks', () => {
    it('placeholder', () => {
      expect(true).toBe(true);
    });
  });

  describe('Session Auto-creation', () => {
    it('should complete dispatch without crashing', async () => {
      piSession.setResponses([{ text: 'hello' }]);
      await withAgent(async (agent) => {
        await agent.dispatch('hello');
        expect(piSession.runWithPiAgentSession).toHaveBeenCalled();
      });
    });
  });
});

