/**
 * 测试环境设置
 *
 * 配置全局测试环境、mock 和工具
 */

import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// ============================================
// 全局 Mock 设置
// ============================================

// Mock Agent SDK - 完整 mock
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(async function* () {
    yield { result: 'Mock response' };
  }),
  tool: vi.fn((name, description, schema, handler) => ({
    name,
    description,
    inputSchema: schema,
    handler,
  })),
  createSdkMcpServer: vi.fn((config) => ({
    name: config.name,
    tools: config.tools || [],
  })),
  Options: vi.fn(),
  AgentDefinition: vi.fn(),
  McpServerConfig: vi.fn(),
}));

// Mock 环境变量
process.env.NODE_ENV = 'test';
process.env.ANTHROPIC_API_KEY = 'test-api-key';

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
