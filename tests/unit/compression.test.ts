/**
 * 压缩策略测试
 */

import { describe, it, expect } from 'vitest';
import { createTokenCounter, SimpleTokenCounter } from '../../src/compression/TokenCounter.js';
import { SlidingWindowStrategy } from '../../src/compression/strategies/SlidingWindowStrategy.js';
import { SummaryStrategy } from '../../src/compression/strategies/SummaryStrategy.js';
import { HybridStrategy } from '../../src/compression/strategies/HybridStrategy.js';
import { CompressionService, createCompressionService } from '../../src/compression/CompressionService.js';
import type { Message } from '../../src/session/types.js';
import type { CompressionContext } from '../../src/compression/types.js';
import { DEFAULT_COMPRESSION_CONFIG } from '../../src/compression/types.js';

// 辅助函数：创建测试消息
function createTestMessage(role: 'user' | 'assistant' | 'system', content: string): Message {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    content,
    timestamp: new Date(),
  };
}

// 辅助函数：创建测试消息列表
function createTestMessages(count: number): Message[] {
  const messages: Message[] = [];
  for (let i = 0; i < count; i++) {
    messages.push(
      createTestMessage('user', `User message ${i + 1}: This is a test message with some content.`)
    );
    messages.push(
      createTestMessage('assistant', `Assistant response ${i + 1}: Here is a detailed response.`)
    );
  }
  return messages;
}

describe('TokenCounter', () => {
  it('should count tokens for text', () => {
    const counter = createTokenCounter();

    const count = counter.count('Hello, world!');
    expect(count).toBeGreaterThan(0);
  });

  it('should return 0 for empty text', () => {
    const counter = createTokenCounter();
    expect(counter.count('')).toBe(0);
  });

  it('should count message tokens including overhead', () => {
    const counter = createTokenCounter();
    const message = createTestMessage('user', 'Hello');

    const count = counter.countMessage(message);
    // 应该包括内容 + 角色开销 + 格式开销
    expect(count).toBeGreaterThan(counter.count('Hello'));
  });

  it('should count messages array', () => {
    const counter = createTokenCounter();
    const messages = createTestMessages(2);

    const count = counter.countMessages(messages);
    expect(count).toBeGreaterThan(0);
  });

  it('should apply safety factor', () => {
    const counter1 = new SimpleTokenCounter({ safetyFactor: 1.0 });
    const counter2 = new SimpleTokenCounter({ safetyFactor: 1.5 });

    const text = 'This is a test message for counting tokens.';
    const count1 = counter1.count(text);
    const count2 = counter2.count(text);

    expect(count2).toBeGreaterThan(count1);
  });
});

describe('SlidingWindowStrategy', () => {
  it('should preserve recent messages', async () => {
    const strategy = new SlidingWindowStrategy(3);
    const messages = createTestMessages(5); // 10 条消息
    const context: CompressionContext = {
      currentTokens: 1000,
      messageCount: messages.length,
      contextWindowSize: 200000,
      threshold: 160000,
      config: DEFAULT_COMPRESSION_CONFIG,
    };

    const result = await strategy.compress(messages, context);

    expect(result.messages.length).toBe(3);
    // 应该保留最后 3 条消息
    expect(result.messages[result.messages.length - 1].content).toContain('Assistant response 5');
  });

  it('should not compress if messages are fewer than preserve count', async () => {
    const strategy = new SlidingWindowStrategy(5);
    const messages = createTestMessages(1); // 2 条消息
    const context: CompressionContext = {
      currentTokens: 100,
      messageCount: messages.length,
      contextWindowSize: 200000,
      threshold: 160000,
      config: DEFAULT_COMPRESSION_CONFIG,
    };

    const result = await strategy.compress(messages, context);

    expect(result.messages.length).toBe(2);
    expect(result.tokensSaved).toBe(0);
  });

  it('should detect compression need', () => {
    const strategy = new SlidingWindowStrategy(5);

    const needsCompress1 = strategy.shouldCompress({
      messageCount: 20,
    } as CompressionContext);
    expect(needsCompress1).toBe(true);

    const needsCompress2 = strategy.shouldCompress({
      messageCount: 5,
    } as CompressionContext);
    expect(needsCompress2).toBe(false);
  });
});

describe('SummaryStrategy', () => {
  it('should generate summary for early messages', async () => {
    const strategy = new SummaryStrategy({ summaryThreshold: 5 });
    const messages = createTestMessages(5); // 10 条消息
    const context: CompressionContext = {
      currentTokens: 1000,
      messageCount: messages.length,
      contextWindowSize: 200000,
      threshold: 160000,
      config: DEFAULT_COMPRESSION_CONFIG,
    };

    const result = await strategy.compress(messages, context);

    // 应该生成摘要 + 保留后半部分
    expect(result.messages.length).toBeLessThan(messages.length);
    // 第一条应该是系统摘要
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toContain('摘要');
  });

  it('should not compress if messages are fewer than threshold', async () => {
    const strategy = new SummaryStrategy({ summaryThreshold: 10 });
    const messages = createTestMessages(2); // 4 条消息
    const context: CompressionContext = {
      currentTokens: 100,
      messageCount: messages.length,
      contextWindowSize: 200000,
      threshold: 160000,
      config: DEFAULT_COMPRESSION_CONFIG,
    };

    const result = await strategy.compress(messages, context);

    expect(result.messages.length).toBe(messages.length);
    expect(result.tokensSaved).toBe(0);
  });
});

describe('HybridStrategy', () => {
  it('should combine summary and sliding window', async () => {
    const strategy = new HybridStrategy({
      preserveRecent: 3,
      summaryThreshold: 5,
    });
    const messages = createTestMessages(5); // 10 条消息
    const context: CompressionContext = {
      currentTokens: 1000,
      messageCount: messages.length,
      contextWindowSize: 200000,
      threshold: 160000,
      config: DEFAULT_COMPRESSION_CONFIG,
    };

    const result = await strategy.compress(messages, context);

    // 应该是摘要 + 最近 3 条消息
    expect(result.messages.length).toBe(4); // 1 摘要 + 3 最近
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toContain('摘要');
  });

  it('should use sliding window when below summary threshold', async () => {
    const strategy = new HybridStrategy({
      preserveRecent: 3,
      summaryThreshold: 20,
    });
    const messages = createTestMessages(2); // 4 条消息
    const context: CompressionContext = {
      currentTokens: 1000,
      messageCount: messages.length,
      contextWindowSize: 200000,
      threshold: 160000,
      config: DEFAULT_COMPRESSION_CONFIG,
    };

    const result = await strategy.compress(messages, context);

    // 消息数超过 preserveRecent，会使用滑动窗口
    // 4 条消息，保留最近 3 条
    expect(result.messages.length).toBe(3);
  });
});

describe('CompressionService', () => {
  it('should detect when compression is needed', () => {
    const service = createCompressionService({
      compression: {
        contextWindowSize: 1000,
        thresholdPercentage: 0.8,
      },
    });

    // 创建大量消息以触发压缩
    const messages = createTestMessages(50);

    const needs = service.needsCompression(messages);
    expect(needs).toBe(true);
  });

  it('should compress messages', async () => {
    const service = createCompressionService({
      compression: {
        strategy: 'hybrid',
        preserveRecent: 3,
        summaryThreshold: 5,
      },
    });

    const messages = createTestMessages(10);
    const result = await service.compress(messages);

    expect(result.messages.length).toBeLessThan(messages.length);
    expect(result.tokensSaved).toBeGreaterThan(0);
    expect(result.strategy).toBe('hybrid');
    expect(result.state).toBeDefined();
    expect(result.state.originalMessageCount).toBe(messages.length);
  });

  it('should use different strategies', async () => {
    const slidingService = createCompressionService({
      compression: { strategy: 'sliding-window', preserveRecent: 3 },
    });

    const messages = createTestMessages(5);
    const result = await slidingService.compress(messages);

    expect(result.strategy).toBe('sliding-window');
    expect(result.messages.length).toBe(3);
  });

  it('should compress only when needed', async () => {
    const service = createCompressionService({
      compression: {
        contextWindowSize: 1000000, // 很大的上下文窗口
        thresholdPercentage: 0.8,
      },
    });

    const messages = createTestMessages(2); // 少量消息

    const result = await service.compressIfNeeded(messages);

    // 不需要压缩
    expect(result.messages.length).toBe(messages.length);
    expect(result.tokensSaved).toBe(0);
  });
});
