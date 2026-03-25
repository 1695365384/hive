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
  // sendStream() 测试
  // ============================================

  describe('sendStream()', () => {
    it('should stream messages', async () => {
      const receivedText: string[] = [];
      mockQuery.mockImplementation(async function* () {
        yield { result: 'Part 1' };
        yield { result: ' Part 2' };
        yield { result: ' Part 3' };
      });

      await capability.sendStream('Hello', {
        onText: (text) => receivedText.push(text),
      });

      expect(receivedText).toEqual(['Part 1', ' Part 2', ' Part 3']);
    });

    it('should trigger tool:before hook on tool progress', async () => {
      mockQuery.mockImplementation(async function* () {
        yield { type: 'tool_progress', tool_name: 'Read', tool_input: { file_path: '/test.ts' } };
        yield { result: 'Done' };
      });

      await capability.sendStream('Hello');

      expect(context.hookRegistry.emit).toHaveBeenCalledWith(
        'tool:before',
        expect.objectContaining({
          toolName: 'Read',
        })
      );
    });

    it('should call onTool callback', async () => {
      const onTool = vi.fn();
      mockQuery.mockImplementation(async function* () {
        yield { type: 'tool_progress', tool_name: 'Read', tool_input: { file_path: '/test.ts' } };
        yield { result: 'Done' };
      });

      await capability.sendStream('Hello', { onTool });

      expect(onTool).toHaveBeenCalledWith('Read', { file_path: '/test.ts' });
    });

    it('should handle tool_use in assistant message', async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          message: {
            content: [
              { type: 'tool_use', name: 'Write', input: { file_path: '/test.ts' } },
            ],
          },
        };
        yield { result: 'Done' };
      });

      await capability.sendStream('Hello');

      expect(context.hookRegistry.emit).toHaveBeenCalledWith(
        'tool:before',
        expect.objectContaining({
          toolName: 'Write',
        })
      );
    });

    it('should work without active provider', async () => {
      const noProviderContext = createMockAgentContext({
        activeProvider: null,
        providers: [],
      });
      const noProviderCapability = new ChatCapability();
      noProviderCapability.initialize(noProviderContext);

      mockQuery.mockImplementation(async function* () {
        yield { result: 'OK' };
      });

      await noProviderCapability.sendStream('Hello');

      // 应该仍然能执行（使用环境变量默认配置）
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should pass mcpServers when available', async () => {
      vi.mocked(context.providerManager.getMcpServersForAgent).mockReturnValue({
        'test-server': { command: 'test', args: [] },
      });

      mockQuery.mockImplementation(async function* () {
        yield { result: 'OK' };
      });

      await capability.sendStream('Hello');

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.mcpServers).toBeDefined();
    });

    it('should pass agents when specified', async () => {
      mockQuery.mockImplementation(async function* () {
        yield { result: 'OK' };
      });

      await capability.sendStream('Hello', {
        agents: ['explore', 'plan'] as any,
      });

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.agents).toBeDefined();
    });

    it('should stop before invoking SDK when already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(capability.sendStream('Hello', {
        abortSignal: controller.signal,
      })).rejects.toThrow('Request aborted');

      expect(mockQuery).not.toHaveBeenCalled();
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

    it('should call onError callback on error', async () => {
      const onError = vi.fn();
      mockQuery.mockImplementation(async function* () {
        throw new Error('Query failed');
      });

      try {
        await capability.sendStream('Hello', { onError });
      } catch {
        // 预期会抛出错误
      }

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle invalid tool messages gracefully', async () => {
      mockQuery.mockImplementation(async function* () {
        yield { type: 'tool_progress' }; // 缺少 tool_name
        yield { result: 'Done' };
      });

      // 不应该抛出错误
      await capability.sendStream('Hello');
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
