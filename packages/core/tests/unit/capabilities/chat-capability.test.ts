/**
 * ChatCapability 单元测试
 *
 * 测试对话能力
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ChatCapability } from '../../../src/agents/capabilities/ChatCapability.js';
import {
  createMockAgentContext,
  createTestProviderConfig,
} from '../../mocks/agent-context.mock.js';
import type { AgentContext } from '../../../src/agents/core/types.js';

// Mock @anthropic-ai/claude-agent-sdk
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

describe('ChatCapability', () => {
  let capability: ChatCapability;
  let context: AgentContext;
  let mockQuery: ReturnType<typeof vi.fn>;

  const testProvider = createTestProviderConfig({
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'test-api-key',
    model: 'deepseek-chat',
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // 导入 mock 后的 query
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    mockQuery = query as ReturnType<typeof vi.fn>;

    capability = new ChatCapability();
    context = createMockAgentContext({
      activeProvider: testProvider,
      providers: [testProvider],
    });
    capability.initialize(context);
  });

  afterEach(() => {
    vi.resetModules();
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
      // 设置 mock 返回值
      mockQuery.mockImplementation(async function* () {
        yield { result: 'Hello, ' };
        yield { result: 'world!' };
      });

      const result = await capability.send('Hello');

      expect(result).toBe('Hello, world!');
    });

    it('should call onText callback', async () => {
      const onText = vi.fn();
      mockQuery.mockImplementation(async function* () {
        yield { result: 'Test response' };
      });

      await capability.send('Hello', { onText });

      expect(onText).toHaveBeenCalledWith('Test response');
    });

    it('should use provider configuration', async () => {
      mockQuery.mockImplementation(async function* () {
        yield { result: 'OK' };
      });

      await capability.send('Hello');

      // 验证 query 被调用
      expect(mockQuery).toHaveBeenCalled();
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.prompt).toBe('Hello');
    });

    it('should override provider and model for a single request', async () => {
      const overrideProvider = createTestProviderConfig({
        id: 'glm',
        name: 'GLM',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        apiKey: 'glm-api-key',
        model: 'glm-default',
      });

      vi.mocked(context.providerManager.get).mockReturnValue(overrideProvider);
      mockQuery.mockImplementation(async function* () {
        yield { result: 'OK' };
      });

      await capability.send('Hello', {
        providerId: 'glm',
        modelId: 'glm-5',
      });

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.env.ANTHROPIC_BASE_URL).toBe(overrideProvider.baseUrl);
      expect(callArgs.options.env.ANTHROPIC_API_KEY).toBe(overrideProvider.apiKey);
      expect(callArgs.options.env.ANTHROPIC_MODEL).toBe('glm-5');
    });

    it('should handle empty response', async () => {
      mockQuery.mockImplementation(async function* () {
        // 不 yield 任何结果
      });

      const result = await capability.send('Hello');

      expect(result).toBe('');
    });

    it('should handle errors', async () => {
      const onError = vi.fn();
      mockQuery.mockImplementation(async function* () {
        yield { result: 'Start' };
        throw new Error('Test error');
      });

      await expect(capability.send('Hello', { onError })).rejects.toThrow('Test error');
      expect(onError).toHaveBeenCalled();
    });
  });

  // ============================================
  // 错误处理测试
  // ============================================

  describe('错误处理', () => {
    it('should handle query errors', async () => {
      mockQuery.mockImplementation(() => {
        throw new Error('Query failed');
      });

      await expect(capability.send('Hello')).rejects.toThrow('Query failed');
    });

  });

  // ============================================
  // streaming behavior 测试
  // ============================================

  describe('streaming behavior', () => {
    it('should invoke onText callback for each chunk and accumulate result', async () => {
      const texts: string[] = [];
      mockQuery.mockImplementation(async function* () {
        yield { result: 'chunk1' };
        yield { result: 'chunk2' };
        yield { result: 'chunk3' };
      });

      const result = await capability.send('Hello', {
        onText: (t) => texts.push(t),
      });

      expect(result).toBe('chunk1chunk2chunk3');
      expect(texts).toEqual(['chunk1', 'chunk2', 'chunk3']);
    });

    it('should accumulate result correctly without onText callback', async () => {
      mockQuery.mockImplementation(async function* () {
        yield { result: 'a' };
        yield { result: 'b' };
        yield { result: 'c' };
      });

      const result = await capability.send('Hello');

      expect(result).toBe('abc');
    });

    it('should respect abort signal before iteration starts', async () => {
      const abortController = new AbortController();
      abortController.abort();

      mockQuery.mockImplementation(async function* () {
        yield { result: 'should not reach' };
      });

      await expect(
        capability.send('Hello', { abortSignal: abortController.signal })
      ).rejects.toThrow('Request aborted');
    });

    it('should respect abort signal during iteration', async () => {
      const abortController = new AbortController();

      mockQuery.mockImplementation(async function* () {
        yield { result: 'first' };
        // Abort after first chunk
        abortController.abort();
        yield { result: 'should not reach' };
      });

      await expect(
        capability.send('Hello', { abortSignal: abortController.signal })
      ).rejects.toThrow('Request aborted');
    });

    it('should emit tool:before hook for tool_progress messages', async () => {
      mockQuery.mockImplementation(async function* () {
        yield { type: 'tool_progress', tool_name: 'Bash', tool_input: { command: 'ls' } };
        yield { result: 'done' };
      });

      await capability.send('Hello');

      const emitCalls = vi.mocked(context.hookRegistry.emit).mock.calls;
      const toolBeforeCalls = emitCalls.filter(
        (call) => call[0] === 'tool:before'
      );

      expect(toolBeforeCalls.length).toBeGreaterThanOrEqual(1);
      expect(toolBeforeCalls[0][1]).toMatchObject({
        toolName: 'Bash',
        input: { command: 'ls' },
      });
    });

    it('should emit tool:before hook for tool_use content blocks', async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          message: {
            content: [
              { type: 'tool_use', name: 'Read', input: { file_path: '/tmp/test.txt' } },
            ],
          },
        };
        yield { result: 'file contents' };
      });

      await capability.send('Hello');

      const emitCalls = vi.mocked(context.hookRegistry.emit).mock.calls;
      const toolBeforeCalls = emitCalls.filter(
        (call) => call[0] === 'tool:before'
      );

      expect(toolBeforeCalls.length).toBeGreaterThanOrEqual(1);
      expect(toolBeforeCalls[0][1]).toMatchObject({
        toolName: 'Read',
        input: { file_path: '/tmp/test.txt' },
      });
    });

    it('should emit tool:after hook when result arrives after tool calls', async () => {
      mockQuery.mockImplementation(async function* () {
        yield { type: 'tool_progress', tool_name: 'Bash', tool_input: { command: 'ls' } };
        yield { result: 'output' };
      });

      await capability.send('Hello');

      const emitCalls = vi.mocked(context.hookRegistry.emit).mock.calls;
      const toolAfterCalls = emitCalls.filter(
        (call) => call[0] === 'tool:after'
      );

      expect(toolAfterCalls.length).toBeGreaterThanOrEqual(1);
      expect(toolAfterCalls[0][1]).toMatchObject({
        toolName: 'Bash',
        success: true,
        output: 'output',
      });
    });

    it('should invoke onTool callback for tool_progress messages', async () => {
      const onTool = vi.fn();
      mockQuery.mockImplementation(async function* () {
        yield { type: 'tool_progress', tool_name: 'Write', tool_input: { path: '/tmp/a.txt' } };
        yield { result: 'written' };
      });

      await capability.send('Hello', { onTool });

      expect(onTool).toHaveBeenCalledWith('Write', { path: '/tmp/a.txt' });
    });

    it('should invoke onTool callback for tool_use content blocks', async () => {
      const onTool = vi.fn();
      mockQuery.mockImplementation(async function* () {
        yield {
          message: {
            content: [
              { type: 'tool_use', name: 'Edit', input: { file_path: '/tmp/b.txt' } },
            ],
          },
        };
        yield { result: 'edited' };
      });

      await capability.send('Hello', { onTool });

      expect(onTool).toHaveBeenCalledWith('Edit', { file_path: '/tmp/b.txt' });
    });
  });

  // ============================================
  // 集成测试
  // ============================================

  describe('集成', () => {
    it('should work with AgentContext', async () => {
      mockQuery.mockImplementation(async function* () {
        yield { result: 'OK' };
      });

      await capability.send('Hello');

      // 验证使用了 context 的 provider manager
      expect(context.providerManager.getActiveProvider).toHaveBeenCalled();
    });
  });
});
