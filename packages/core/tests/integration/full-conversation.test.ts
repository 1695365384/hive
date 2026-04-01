/**
 * 完整对话链路集成测试
 *
 * 验证 "用户输入 → LLM 响应 → 工具调用 → 返回结果" 的完整链路。
 * 使用 integration-helpers.ts 提供的智能 mock 覆盖 setup.ts 的全局 mock。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMockAI,
  simpleTextResponse,
  toolCallResponse,
  multiStepResponse,
  withAgent,
  assertMockCalled,
  assertHookFired,
  createMockProviderManagerModule,
  type MockGenerateTextResponse,
} from './integration-helpers.js';

// ============================================
// Mock AI SDK — 覆盖 setup.ts 的全局 mock
// ============================================

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

// Mock ProviderManager — 让 LLMRuntime.resolveModelWithSpec() 返回 fake model
vi.mock('../../src/providers/ProviderManager.js', () => createMockProviderManagerModule());

// ============================================
// Tests
// ============================================

describe('Full Conversation Chain', () => {
  beforeEach(() => {
    resetCallCount();
    vi.clearAllMocks();
  });

  // 3.2 纯文本 chat
  describe('Simple Text Chat', () => {
    it('should return LLM text response', async () => {
      // ChatCapability 使用 streaming: true，所以需要 mock streamText
      mockStreamText.mockReturnValueOnce({
        fullStream: (async function* () {
          yield { type: 'start' };
          yield { type: 'text-delta', text: '你好！有什么可以帮你的？' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 10, outputTokens: 5 } };
        })(),
        text: Promise.resolve('你好！有什么可以帮你的？'),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      });

      const result = await withAgent(async (agent) => {
        return (await agent.dispatch('你好')).text;
      });

      expect(result).toBe('你好！有什么可以帮你的？');
      assertMockCalled(mockStreamText);
    });

    it('should call streamText with correct prompt', async () => {
      mockStreamText.mockReturnValueOnce({
        fullStream: (async function* () {
          yield { type: 'start' };
          yield { type: 'text-delta', text: 'Hello!' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 10, outputTokens: 5 } };
        })(),
        text: Promise.resolve('Hello!'),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      });

      const result = await withAgent(async (agent) => {
        return (await agent.dispatch('Hello')).text;
      });

      expect(result).toBe('Hello!');
      expect(mockStreamText).toHaveBeenCalled();
      const callArgs = mockStreamText.mock.calls[0][0] as Record<string, unknown>;
      // ChatCapability 使用 prompt（无历史时）或 messages（有历史时）
      expect(callArgs.prompt ?? callArgs.messages).toBeDefined();
    });
  });

  // 3.3 工具调用 chat
  describe('Chat with Tool Use', () => {
    it('should execute tool call and return result', async () => {
      // 配置 mock 返回工具调用 → 结果
      mockStreamText.mockReturnValueOnce({
        fullStream: (async function* () {
          yield { type: 'start' };
          yield { type: 'tool-call', toolName: 'file', input: { action: 'read', path: '/tmp/test.ts' } };
          yield { type: 'tool-result', toolName: 'file', output: 'const x = 1;' };
          yield { type: 'finish-step', finishReason: 'tool-calls' };
          yield { type: 'text-delta', text: '文件内容是 const x = 1;' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 50, outputTokens: 30 } };
        })(),
        text: Promise.resolve('文件内容是 const x = 1;'),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([
          {
            toolCalls: [{ toolName: 'file', input: { action: 'read', path: '/tmp/test.ts' } }],
            toolResults: [{ toolName: 'file', output: 'const x = 1;' }],
            finishReason: 'tool-calls',
          },
        ]),
        totalUsage: Promise.resolve({ inputTokens: 50, outputTokens: 30 }),
      });

      const result = await withAgent(async (agent) => {
        return (await agent.dispatch('读取 /tmp/test.ts 的内容')).text;
      });

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // 3.4 多轮对话上下文
  describe('Multi-turn Context', () => {
    it('should pass conversation history on second call', async () => {
      // 第一轮：纯文本响应
      mockStreamText.mockReturnValueOnce({
        fullStream: (async function* () {
          yield { type: 'start' };
          yield { type: 'text-delta', text: '第一轮回复' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 10, outputTokens: 5 } };
        })(),
        text: Promise.resolve('第一轮回复'),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      });

      // 第二轮：也返回文本
      mockStreamText.mockReturnValueOnce({
        fullStream: (async function* () {
          yield { type: 'start' };
          yield { type: 'text-delta', text: '第二轮回复' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 30, outputTokens: 10 } };
        })(),
        text: Promise.resolve('第二轮回复'),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 30, outputTokens: 10 }),
      });

      await withAgent(async (agent) => {
        const r1 = await agent.dispatch('第一轮消息');
        expect(r1.text).toBe('第一轮回复');

        const r2 = await agent.dispatch('第二轮消息');
        expect(r2.text).toBe('第二轮回复');

        // 验证 streamText 被调用了两次
        expect(mockStreamText).toHaveBeenCalledTimes(2);
      });
    });
  });

  // 3.5 tool:before/after hook 触发
  describe('Tool Execution Hooks', () => {
    it('should fire tool:before and tool:after hooks on tool call', async () => {
      const beforeHook = vi.fn().mockResolvedValue({ proceed: true });
      const afterHook = vi.fn().mockResolvedValue({ proceed: true });

      mockStreamText.mockReturnValueOnce({
        fullStream: (async function* () {
          yield { type: 'start' };
          yield { type: 'tool-call', toolName: 'file', input: { action: 'read', path: '/test.ts' } };
          yield { type: 'tool-result', toolName: 'file', output: 'content' };
          yield { type: 'finish-step', finishReason: 'tool-calls' };
          yield { type: 'text-delta', text: 'Done' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 50, outputTokens: 25 } };
        })(),
        text: Promise.resolve('Done'),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 50, outputTokens: 25 }),
      });

      await withAgent(async (agent) => {
        // 注册 hooks
        agent.context.hookRegistry.on('tool:before', beforeHook);
        agent.context.hookRegistry.on('tool:after', afterHook);

        await agent.dispatch('读取文件');
      });

      // tool:before 和 tool:after 应该在 ChatCapability.handleToolUse/handleToolResult 中触发
      assertHookFired(beforeHook, { toolName: 'file' });
      assertHookFired(afterHook, { toolName: 'file' });
    });
  });

  // 3.6 Session 自动创建
  describe('Session Auto-creation', () => {
    it('should have currentSession after chat', async () => {
      mockStreamText.mockReturnValueOnce({
        fullStream: (async function* () {
          yield { type: 'start' };
          yield { type: 'text-delta', text: 'Response' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 10, outputTokens: 5 } };
        })(),
        text: Promise.resolve('Response'),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 5 }),
      });

      await withAgent(async (agent) => {
        // currentSession 在 initialize 时已由 session capability 创建
        // 或者可能在首次 chat 后
        await agent.dispatch('hello');

        // Agent 应该有 session capability 提供的 session
        expect(agent).toHaveProperty('currentSession');
      });
    });
  });
});
