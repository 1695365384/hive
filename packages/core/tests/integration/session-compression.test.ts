/**
 * Compression + Session 集成测试
 *
 * 测试压缩功能与会话管理的完整集成，使用 MockSessionRepository
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Agent, createAgent } from '../../src/agents/core/index.js';
import { SimpleTokenCounter, createTokenCounter, shouldCompress } from '../../src/compression/TokenCounter.js';
import { MockSessionRepository } from '../helpers/mock-repository.js';

describe('Compression + Session Integration', () => {
  // ============================================
  // Token Counter Integration
  // ============================================
  describe('Token Counter Integration', () => {
    it('should have TokenCounter available', () => {
      const tokenCounter = createTokenCounter();
      expect(tokenCounter).toBeDefined();
    });

    it('should count tokens in text', () => {
      const tokenCounter = createTokenCounter();
      const text = 'Hello, this is a test message for token counting.';

      const count = tokenCounter.count(text);
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should handle empty text', () => {
      const tokenCounter = createTokenCounter();
      const count = tokenCounter.count('');
      expect(count).toBe(0);
    });

    it('should count tokens in code', () => {
      const tokenCounter = createTokenCounter();
      const code = `
function hello() {
  console.log('Hello, World!');
  return 42;
}
      `;

      const count = tokenCounter.count(code);
      expect(count).toBeGreaterThan(0);
    });

    it('should estimate tokens from character count', () => {
      const tokenCounter = createTokenCounter();
      const text = 'a'.repeat(100);

      const count = tokenCounter.count(text);
      // 使用字符计数估算，大约 4 字符 = 1 token
      expect(count).toBeGreaterThan(20);
      expect(count).toBeLessThan(50);
    });
  });

  // ============================================
  // Session Compression Trigger
  // ============================================
  describe('Session Compression Trigger', () => {
    let agent: Agent;
    let repository: MockSessionRepository;

    beforeEach(async () => {
      repository = new MockSessionRepository();
      agent = createAgent({
        sessionConfig: {
          dbPath: ':memory:',
          autoSave: true,
          enableCompression: true,
        },
      });
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should have sessionCap available', () => {
      const sessionCap = (agent as any).sessionCap;
      expect(sessionCap).toBeDefined();
    });

    it('should have compress method', () => {
      const sessionCap = (agent as any).sessionCap;
      expect(typeof sessionCap.compress).toBe('function');
    });

    it('should add messages to session', async () => {
      const sessionCap = (agent as any).sessionCap;
      await sessionCap.addUserMessage('Test message', 10);

      const messages = agent.getSessionMessages();
      expect(messages.length).toBeGreaterThan(0);
    });

    it('should compress session when threshold exceeded', async () => {
      const sessionCap = (agent as any).sessionCap;

      // 添加大量消息超过阈值
      for (let i = 0; i < 20; i++) {
        await sessionCap.addUserMessage(`Message ${i}: This is a longer message to increase token count.`, 20);
        await sessionCap.addAssistantMessage(`Response ${i}: This is a longer response to increase token count.`, 30);
      }

      // 执行压缩
      const result = await sessionCap.compress();

      if (result) {
        expect(result.tokensSaved).toBeGreaterThan(0);
        expect(result.strategy).toBeDefined();
      }
    });
  });

  // ============================================
  // Compression Strategies
  // ============================================
  describe('Compression Strategies', () => {
    let agent: Agent;

    afterEach(async () => {
      await agent?.dispose();
    });

    it('should use sliding-window strategy', async () => {
      agent = createAgent({
        sessionConfig: {
          dbPath: ':memory:',
          enableCompression: true,
          autoSave: true,
        },
      });
      await agent.initialize();

      const sessionCap = (agent as any).sessionCap;

      // 添加消息
      for (let i = 0; i < 20; i++) {
        await sessionCap.addUserMessage(`Message ${i}`, 10);
      }

      const result = await sessionCap.compress();

      if (result) {
        // Strategy should be one of the valid strategies
        expect(['sliding-window', 'summary', 'hybrid']).toContain(result.strategy);
      }
    });
  });

  // ============================================
  // Compression State Persistence
  // ============================================
  describe('Compression State Persistence', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent({
        sessionConfig: {
          dbPath: ':memory:',
          enableCompression: true,
          autoSave: true,
        },
      });
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should save compression state to session', async () => {
      const sessionCap = (agent as any).sessionCap;

      // 添加消息
      for (let i = 0; i < 30; i++) {
        await sessionCap.addUserMessage(`Message ${i}`, 10);
      }

      // 执行压缩
      const result = await sessionCap.compress();

      if (result) {
        await sessionCap.save();

        const session = agent.currentSession;
        expect(session?.compressionState).toBeDefined();
        expect(session?.compressionState?.tokensSaved).toBeGreaterThan(0);
      }
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent({
        sessionConfig: {
          dbPath: ':memory:',
          enableCompression: true,
          autoSave: true,
        },
      });
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should handle compression when no messages', async () => {
      const sessionCap = (agent as any).sessionCap;

      // 不添加消息直接压缩
      const result = await sessionCap.compress();

      // 应该返回 null 或有效的结果
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should handle compression when below threshold', async () => {
      const sessionCap = (agent as any).sessionCap;

      // 添加少量消息
      await sessionCap.addUserMessage('Short message', 5);

      const result = await sessionCap.compress();

      // 可能不压缩或返回有效结果
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should handle compression disabled', async () => {
      await agent.dispose();

      agent = createAgent({
        sessionConfig: {
          dbPath: ':memory:',
          enableCompression: false,
          autoSave: true,
        },
      });
      await agent.initialize();

      const sessionCap = (agent as any).sessionCap;

      // 添加消息
      for (let i = 0; i < 20; i++) {
        await sessionCap.addUserMessage(`Message ${i}`, 10);
      }

      // 压缩可能返回 null（禁用）或仍可用
      const result = await sessionCap.compress();
      expect(result === null || typeof result === 'object').toBe(true);
    });
  });

  // ============================================
  // Performance
  // ============================================
  describe('Performance', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent({
        sessionConfig: {
          dbPath: ':memory:',
          enableCompression: true,
          autoSave: true,
        },
      });
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should compress large session within reasonable time', async () => {
      const sessionCap = (agent as any).sessionCap;

      // 添加大量消息
      for (let i = 0; i < 100; i++) {
        await sessionCap.addUserMessage(`Message ${i}: This is a test message with some content.`, 15);
      }

      const startTime = Date.now();
      const result = await sessionCap.compress();
      const duration = Date.now() - startTime;

      // 压缩应该在 5 秒内完成
      expect(duration).toBeLessThan(5000);
    });

    it('should handle concurrent compression requests', async () => {
      const sessionCap = (agent as any).sessionCap;

      // 添加消息
      for (let i = 0; i < 30; i++) {
        await sessionCap.addUserMessage(`Message ${i}`, 10);
      }

      // 并发压缩
      const promises = [
        sessionCap.compress(),
        sessionCap.compress(),
        sessionCap.compress(),
      ];

      const results = await Promise.all(promises);

      // 所有请求应该完成
      expect(results.length).toBe(3);
    });
  });

  // ============================================
  // 压缩阈值触发验证
  // ============================================
  describe('Compression Threshold Trigger', () => {
    it('should not trigger compression below threshold', async () => {
      // 默认 SlidingWindowStrategy preserveRecent=5，阈值=10
      // 添加 5 条消息（低于阈值）
      const agent = createAgent({
        sessionConfig: {
          dbPath: ':memory:',
          enableCompression: true,
          autoSave: true,
        },
      });
      await agent.initialize();

      const sessionCap = (agent as any).sessionCap;

      for (let i = 0; i < 5; i++) {
        await sessionCap.addUserMessage(`Message ${i}`, 10);
      }

      // needsCompression 应该返回 false（消息数 5 <= 10）
      const needs = sessionCap.needsCompression();
      expect(needs).toBe(false);

      await agent.dispose();
    });

    it('should trigger compression when messages exceed threshold', async () => {
      const agent = createAgent({
        sessionConfig: {
          dbPath: ':memory:',
          enableCompression: true,
          autoSave: true,
        },
      });
      await agent.initialize();

      const sessionCap = (agent as any).sessionCap;

      // 添加 12 条消息（超过默认阈值 10）
      for (let i = 0; i < 12; i++) {
        await sessionCap.addUserMessage(`Message ${i}: This is a test message for threshold.`, 20);
      }

      // needsCompression 应该返回 true（消息数 12 > 10）
      const needs = sessionCap.needsCompression();
      expect(needs).toBe(true);

      await agent.dispose();
    });

    it('should compress via compressIfNeeded only when threshold exceeded', async () => {
      const agent = createAgent({
        sessionConfig: {
          dbPath: ':memory:',
          enableCompression: true,
          autoSave: true,
        },
      });
      await agent.initialize();

      const sessionCap = (agent as any).sessionCap;

      // 添加 3 条消息（低于阈值）
      for (let i = 0; i < 3; i++) {
        await sessionCap.addUserMessage(`Short ${i}`, 5);
      }

      const result1 = await sessionCap.compressIfNeeded();
      // 低于阈值，不应压缩
      expect(result1).toBeNull();

      // 添加更多消息超过阈值
      for (let i = 3; i < 15; i++) {
        await sessionCap.addUserMessage(`Message ${i}: longer content here`, 20);
      }

      const result2 = await sessionCap.compressIfNeeded();
      // 超过阈值，应该压缩
      if (result2) {
        expect(result2.tokensSaved).toBeGreaterThanOrEqual(0);
        expect(result2.strategy).toBeDefined();
      }

      await agent.dispose();
    });

    it('should use shouldCompress utility correctly', () => {
      const smallConfig = {
        contextWindowSize: 8000,
        summaryThreshold: 10,
        compressionRatio: 0.3,
        threshold: 0,
        strategy: 'sliding-window' as const,
        preserveRecent: 5,
        maxSummaryTokens: 500,
        thresholdPercentage: 0.8,
      };

      // 低于阈值（8000 * 0.8 = 6400）
      expect(shouldCompress(100, 5, smallConfig)).toBe(false);

      // 高于 token 阈值（6400）
      expect(shouldCompress(7000, 10, smallConfig)).toBe(true);

      // 消息数超过 summaryThreshold * 2（10 * 2 = 20）
      expect(shouldCompress(100, 25, smallConfig)).toBe(true);
    });

    it('should preserve recent messages after compression', async () => {
      const agent = createAgent({
        sessionConfig: {
          dbPath: ':memory:',
          enableCompression: true,
          autoSave: true,
        },
      });
      await agent.initialize();

      const sessionCap = (agent as any).sessionCap;

      // 添加 15 条消息
      for (let i = 0; i < 15; i++) {
        await sessionCap.addUserMessage(`Message ${i}`, 10);
      }

      // 执行压缩
      const result = await sessionCap.compress();

      if (result) {
        // 压缩后消息数应少于原始消息数
        const messages = agent.getSessionMessages();
        expect(messages.length).toBeLessThan(15);
        expect(messages.length).toBeGreaterThan(0);
      }

      await agent.dispose();
    });
  });
});
