/**
 * 测试环境设置
 *
 * 配置全局测试环境、mock 和工具
 */

import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// ============================================
// 全局 Mock 设置
// ============================================

// Mock AI SDK - generateText / streamText
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: 'Mock response',
    steps: [],
    totalUsage: { inputTokens: 10, outputTokens: 20 },
    finishReason: 'stop',
  }),
  streamText: vi.fn().mockReturnValue({
    fullStream: (async function* () {
      yield { type: 'start' };
      yield { type: 'text-delta', text: 'Mock response' };
      yield { type: 'finish-step', finishReason: 'stop' };
      yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 10, outputTokens: 20 } };
    })(),
    text: Promise.resolve('Mock response'),
    finishReason: Promise.resolve('stop'),
    steps: Promise.resolve([]),
    totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 20 }),
  }),
  stepCountIs: vi.fn((n: number) => n),
  tool: vi.fn((config: Record<string, unknown>) => config),
  zodSchema: vi.fn((schema: unknown) => schema),
}));

// Mock 环境变量
process.env.NODE_ENV = 'test';

// ============================================
// 全局 Hooks
// ============================================

beforeAll(() => {
  // 测试开始前的设置
});

afterEach(async () => {
  // 每个测试后清理 mock
  vi.clearAllMocks();
  // Reset DatabaseManager singleton for test isolation
  const { DatabaseManager } = await import('../src/storage/Database.js');
  DatabaseManager.resetInstances();
});

afterAll(() => {
  // 所有测试结束后的清理
  vi.restoreAllMocks();
});
