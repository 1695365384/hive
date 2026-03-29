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
