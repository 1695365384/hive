/**
 * ChatCapability 单元测试
 *
 * 测试对话能力（基于 LLMRuntime → AI SDK streamText）
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ChatCapability } from '../../../src/agents/capabilities/ChatCapability.js';
import {
  createMockAgentContext,
  createTestProviderConfig,
} from '../../mocks/agent-context.mock.js';
import type { AgentContext } from '../../../src/agents/core/types.js';

// Mock AI SDK — 用 mockImplementation 确保每次调用生成新的 fullStream
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: 'Mock response',
    steps: [],
    totalUsage: { inputTokens: 10, outputTokens: 20 },
    finishReason: 'stop',
  }),
  streamText: vi.fn().mockImplementation(() => ({
    fullStream: (async function* () {
      yield { type: 'text-delta', text: 'Hello, world!' };
      yield { type: 'finish-step', finishReason: 'stop' };
      yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 10, outputTokens: 20 } };
    })(),
    text: Promise.resolve('Hello, world!'),
    finishReason: Promise.resolve('stop'),
    steps: Promise.resolve([]),
    totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 20 }),
  })),
  stepCountIs: vi.fn((n: number) => n),
}));

describe('ChatCapability', () => {
  let capability: ChatCapability;
  let context: AgentContext;
  let mockStreamText: ReturnType<typeof vi.fn>;

  const testProvider = createTestProviderConfig({
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'test-api-key',
    model: 'deepseek-chat',
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    const { streamText } = await import('ai');
    mockStreamText = vi.mocked(streamText);

    capability = new ChatCapability();
    context = createMockAgentContext({
      activeProvider: testProvider,
      providers: [testProvider],
    });
    capability.initialize(context);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('生命周期', () => {
    it('should initialize correctly', () => {
      expect(capability.name).toBe('chat');
    });

    it('should have correct name', () => {
      expect(capability.name).toBe('chat');
    });
  });

  // ============================================
  // send() 测试
  // ============================================

  describe('send()', () => {
    it('should send message and return response', async () => {
      const result = await capability.send('Hello');
      expect(result).toBe('Hello, world!');
    });

    it('should call onText callback', async () => {
      const onText = vi.fn();
      await capability.send('Hello', { onText });
      expect(onText).toHaveBeenCalledWith('Hello, world!');
    });

    it('should call streamText with correct prompt', async () => {
      await capability.send('Hello');
      expect(mockStreamText).toHaveBeenCalled();
      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs.prompt).toBe('Hello');
    });

    it('should handle empty response', async () => {
      mockStreamText.mockImplementation(() => ({
        fullStream: (async function* () {
          yield { type: 'finish-step', finishReason: 'stop' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 0, outputTokens: 0 } };
        })(),
        text: Promise.resolve(''),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
      }));

      const result = await capability.send('Hello');
      expect(result).toBe('');
    });

    it('should handle errors', async () => {
      const onError = vi.fn();
      mockStreamText.mockImplementation(() => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', text: 'Start' };
          throw new Error('Test error');
        })(),
        text: Promise.resolve('Start'),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
      }));

      await expect(capability.send('Hello', { onError })).rejects.toThrow('Test error');
      expect(onError).toHaveBeenCalled();
    });
  });

  // ============================================
  // 错误处理测试
  // ============================================

  describe('错误处理', () => {
    it('should handle streamText errors', async () => {
      mockStreamText.mockImplementation(() => {
        throw new Error('Stream failed');
      });

      await expect(capability.send('Hello')).rejects.toThrow('Stream failed');
    });
  });

  // ============================================
  // streaming behavior 测试
  // ============================================

  describe('streaming behavior', () => {
    it('should invoke onText callback for each chunk and accumulate result', async () => {
      const texts: string[] = [];
      mockStreamText.mockImplementation(() => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', text: 'chunk1' };
          yield { type: 'text-delta', text: 'chunk2' };
          yield { type: 'text-delta', text: 'chunk3' };
          yield { type: 'finish-step', finishReason: 'stop' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 0, outputTokens: 0 } };
        })(),
        text: Promise.resolve('chunk1chunk2chunk3'),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
      }));

      const result = await capability.send('Hello', {
        onText: (t) => texts.push(t),
      });

      expect(result).toBe('chunk1chunk2chunk3');
      expect(texts).toEqual(['chunk1', 'chunk2', 'chunk3']);
    });

    it('should pass abort signal to streamText', async () => {
      const abortController = new AbortController();
      abortController.abort();

      mockStreamText.mockImplementation(() => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', text: 'should not reach' };
          yield { type: 'finish-step', finishReason: 'stop' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 0, outputTokens: 0 } };
        })(),
        text: Promise.resolve('should not reach'),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
      }));

      // LLMRuntime 捕获 AbortError 返回 success:false → ChatCapability 抛出
      // 但 mock 不检查 signal，所以这里只验证 signal 被传递
      await capability.send('Hello', { abortSignal: abortController.signal });

      expect(mockStreamText).toHaveBeenCalled();
      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs.abortSignal?.aborted).toBe(true);
    });
  });

  // ============================================
  // tool events 测试
  // ============================================

  describe('tool events', () => {
    it('should emit tool:before hook for tool-call events', async () => {
      mockStreamText.mockImplementation(() => ({
        fullStream: (async function* () {
          yield { type: 'tool-call', toolName: 'Bash', toolCallId: 'tc-1', input: { command: 'ls' } };
          yield { type: 'tool-result', toolName: 'Bash', toolCallId: 'tc-1', output: 'file1\nfile2' };
          yield { type: 'finish-step', finishReason: 'stop' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 0, outputTokens: 0 } };
        })(),
        text: Promise.resolve(''),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
      }));

      await capability.send('Hello');

      const emitCalls = vi.mocked(context.hookRegistry.emit).mock.calls;
      const toolBeforeCalls = emitCalls.filter(
        (call) => call[0] === 'tool:before'
      );

      expect(toolBeforeCalls.length).toBeGreaterThanOrEqual(1);
      expect(toolBeforeCalls[0][1]).toMatchObject({
        toolName: 'Bash',
      });
    });

    it('should emit tool:after hook for tool-result events', async () => {
      mockStreamText.mockImplementation(() => ({
        fullStream: (async function* () {
          yield { type: 'tool-call', toolName: 'Read', toolCallId: 'tc-2', input: { file_path: '/tmp/test.txt' } };
          yield { type: 'tool-result', toolName: 'Read', toolCallId: 'tc-2', output: 'file contents' };
          yield { type: 'finish-step', finishReason: 'stop' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 0, outputTokens: 0 } };
        })(),
        text: Promise.resolve(''),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
      }));

      await capability.send('Hello');

      const emitCalls = vi.mocked(context.hookRegistry.emit).mock.calls;
      const toolAfterCalls = emitCalls.filter(
        (call) => call[0] === 'tool:after'
      );

      expect(toolAfterCalls.length).toBeGreaterThanOrEqual(1);
      expect(toolAfterCalls[0][1]).toMatchObject({
        toolName: 'Read',
        success: true,
      });
    });

    it('should invoke onTool callback for tool-call events', async () => {
      const onTool = vi.fn();
      mockStreamText.mockImplementation(() => ({
        fullStream: (async function* () {
          yield { type: 'tool-call', toolName: 'Write', toolCallId: 'tc-3', input: { path: '/tmp/a.txt' } };
          yield { type: 'tool-result', toolName: 'Write', toolCallId: 'tc-3', output: 'written' };
          yield { type: 'finish-step', finishReason: 'stop' };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 0, outputTokens: 0 } };
        })(),
        text: Promise.resolve(''),
        finishReason: Promise.resolve('stop'),
        steps: Promise.resolve([]),
        totalUsage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
      }));

      await capability.send('Hello', { onTool });
      expect(onTool).toHaveBeenCalledWith('Write', { path: '/tmp/a.txt' });
    });
  });

  // ============================================
  // 集成测试
  // ============================================

  describe('集成', () => {
    it('should work with AgentContext', async () => {
      await capability.send('Hello');
      // LLMRuntime 通过 providerManager.getModel() 获取模型
      expect(context.providerManager.getModel).toHaveBeenCalled();
    });
  });
});
