/**
 * 测试工具函数
 *
 * 提供测试中常用的辅助函数和 mock 工具
 */

import { vi, expect } from 'vitest';

// ============================================
// 类型定义
// ============================================

export interface MockProvider {
  base_url: string;
  api_key: string;
  model?: string;
}

export interface MockAgentResult {
  text: string;
  tools: string[];
  success: boolean;
  usage?: { input: number; output: number };
  error?: string;
}

export interface MockQueryMessage {
  result?: string;
  content?: Array<{ name: string; input?: unknown }>;
  usage?: { input_tokens: number; output_tokens: number };
  session_id?: string;
  type?: string;
}

// ============================================
// Mock 工厂函数
// ============================================

/**
 * 创建 Mock Provider
 */
export function createMockProvider(overrides?: Partial<MockProvider>): MockProvider {
  return {
    base_url: 'https://api.test.com',
    api_key: 'test-api-key',
    model: 'test-model',
    ...overrides,
  };
}

/**
 * 创建 Mock AgentResult
 */
export function createMockAgentResult(overrides?: Partial<MockAgentResult>): MockAgentResult {
  return {
    text: 'Test result',
    tools: [],
    success: true,
    usage: { input: 100, output: 50 },
    ...overrides,
  };
}

/**
 * 创建 Mock Query 消息迭代器
 */
export function createMockQueryIterator(messages: MockQueryMessage[] = []): AsyncGenerator<MockQueryMessage> {
  return (async function* () {
    for (const msg of messages) {
      yield msg;
    }
  })();
}

/**
 * 创建默认的成功响应消息
 */
export function createSuccessMessage(text: string = 'Success'): MockQueryMessage {
  return { result: text };
}

/**
 * 创建工具调用消息
 */
export function createToolMessage(toolName: string, input?: unknown): MockQueryMessage {
  return {
    content: [{ name: toolName, input }],
  };
}

/**
 * 创建带 usage 的消息
 */
export function createUsageMessage(text: string, inputTokens: number = 100, outputTokens: number = 50): MockQueryMessage {
  return {
    result: text,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

// ============================================
// Mock Agent SDK Query
// ============================================

/**
 * 创建 Mock query 函数
 */
export function createMockQuery(responses: MockQueryMessage[] | string): ReturnType<typeof vi.fn> {
  const messages = typeof responses === 'string'
    ? [createSuccessMessage(responses)]
    : responses;

  return vi.fn().mockReturnValue(createMockQueryIterator(messages));
}

/**
 * 创建 Mock query 函数（支持多次调用）
 */
export function createMockQuerySequence(responseSequences: MockQueryMessage[][]): ReturnType<typeof vi.fn> {
  let callIndex = 0;

  return vi.fn().mockImplementation(() => {
    const messages = responseSequences[callIndex % responseSequences.length];
    callIndex++;
    return createMockQueryIterator(messages);
  });
}

// ============================================
// 断言辅助函数
// ============================================

/**
 * 等待指定毫秒
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 断言函数被调用且参数匹配
 */
export function assertCalledWith(
  mockFn: ReturnType<typeof vi.fn>,
  expected: Record<string, unknown>
): void {
  expect(mockFn).toHaveBeenCalled();
  const calls = mockFn.mock.calls;
  const lastCall = calls[calls.length - 1];
  expect(lastCall[0]).toMatchObject(expected);
}

/**
 * 收集流式输出
 */
export async function collectStream(
  streamFn: (onText: (text: string) => void) => Promise<void>
): Promise<string> {
  let result = '';
  await streamFn((text) => { result += text; });
  return result;
}

// ============================================
// 测试数据生成器
// ============================================

/**
 * 生成随机字符串
 */
export function randomString(length: number = 10): string {
  return Math.random().toString(36).substring(2, length + 2);
}

/**
 * 生成测试任务描述
 */
export function generateTestTasks(): Record<string, string> {
  return {
    simple: 'What is the project structure?',
    moderate: 'Find all API endpoints and list them',
    complex: 'Add a new authentication feature with JWT support',
    bugFix: 'Fix the null pointer exception in user service',
    refactor: 'Refactor the database layer to use repository pattern',
    security: 'Check for SQL injection vulnerabilities',
  };
}

/**
 * 生成测试预设配置
 */
export function generateTestPresets(): Record<string, MockProvider> {
  return {
    anthropic: createMockProvider({
      base_url: 'https://api.anthropic.com',
      model: 'claude-opus-4-6',
    }),
    deepseek: createMockProvider({
      base_url: 'https://api.deepseek.com/anthropic',
      model: 'deepseek-chat',
    }),
    glm: createMockProvider({
      base_url: 'https://open.bigmodel.cn/api/paas/v4/anthropic',
      model: 'glm-4',
    }),
  };
}
