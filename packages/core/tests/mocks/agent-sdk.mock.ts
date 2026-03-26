/**
 * Agent SDK Mock
 *
 * 模拟 @anthropic-ai/claude-agent-sdk 的行为
 */

import { vi } from 'vitest';
import {
  createMockQueryIterator,
  createSuccessMessage,
  createToolMessage,
  createUsageMessage,
  type MockQueryMessage,
} from '../utils/test-helpers';

// ============================================
// 类型定义
// ============================================

export interface MockQueryOptions {
  cwd?: string;
  allowedTools?: string[];
  maxTurns?: number;
  model?: string;
  systemPrompt?: string;
  mcpServers?: Record<string, unknown>;
  agents?: Record<string, unknown>;
  permissionMode?: string;
}

export interface MockQueryParams {
  prompt: string;
  options?: MockQueryOptions;
}

// ============================================
// Mock 状态管理
// ============================================

interface MockState {
  responses: MockQueryMessage[][];
  callCount: number;
  lastParams: MockQueryParams | null;
  allParams: MockQueryParams[];
}

const mockState: MockState = {
  responses: [],
  callCount: 0,
  lastParams: null,
  allParams: [],
};

// ============================================
// Mock 控制 API
// ============================================

/**
 * 重置 mock 状态
 */
export function resetMock(): void {
  mockState.responses = [];
  mockState.callCount = 0;
  mockState.lastParams = null;
  mockState.allParams = [];
}

/**
 * 设置 mock 响应
 */
export function setMockResponse(messages: MockQueryMessage[] | string): void {
  const normalized = typeof messages === 'string'
    ? [[createSuccessMessage(messages)]]
    : [messages];
  mockState.responses = normalized;
}

/**
 * 设置 mock 响应序列（支持多次调用）
 */
export function setMockResponseSequence(sequences: MockQueryMessage[][]): void {
  mockState.responses = sequences;
}

/**
 * 获取调用次数
 */
export function getCallCount(): number {
  return mockState.callCount;
}

/**
 * 获取最后一次调用的参数
 */
export function getLastParams(): MockQueryParams | null {
  return mockState.lastParams;
}

/**
 * 获取所有调用参数
 */
export function getAllParams(): MockQueryParams[] {
  return [...mockState.allParams];
}

/**
 * 验证是否被调用
 */
export function wasCalled(): boolean {
  return mockState.callCount > 0;
}

/**
 * 验证是否包含特定 prompt
 */
export function wasCalledWith(partialPrompt: string): boolean {
  return mockState.allParams.some(p =>
    p.prompt.toLowerCase().includes(partialPrompt.toLowerCase())
  );
}

// ============================================
// Mock query 实现
// ============================================

async function* mockQuery(params: MockQueryParams): AsyncGenerator<MockQueryMessage> {
  mockState.callCount++;
  mockState.lastParams = params;
  mockState.allParams.push(params);

  // 获取对应的响应序列
  const responseIndex = Math.min(mockState.callCount - 1, mockState.responses.length - 1);
  const responses = mockState.responses[responseIndex] || [createSuccessMessage('Default mock response')];

  yield* createMockQueryIterator(responses);
}

// ============================================
// 预设场景
// ============================================

/**
 * 设置探索场景响应
 */
export function setupExploreScenario(findings: string = 'Found 5 relevant files'): void {
  setMockResponse([
    createUsageMessage(findings, 50, 100),
  ]);
}

/**
 * 设置计划场景响应
 */
export function setupPlanScenario(plan: string = 'Implementation plan generated'): void {
  setMockResponse([
    createUsageMessage(plan, 100, 200),
  ]);
}

/**
 * 设置执行场景响应
 */
export function setupExecuteScenario(result: string = 'Task completed successfully'): void {
  setMockResponse([
    createToolMessage('Read', { file_path: '/test/file.ts' }),
    createToolMessage('Edit', { file_path: '/test/file.ts', old_string: 'old', new_string: 'new' }),
    createUsageMessage(result, 200, 300),
  ]);
}

/**
 * 设置错误场景响应
 */
export function setupErrorScenario(error: string = 'Something went wrong'): void {
  setMockResponse([
    { result: undefined },
  ]);

  // 让下一次调用抛出错误
  vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
    query: vi.fn().mockImplementation(() => {
      throw new Error(error);
    }),
  }));
}

/**
 * 设置工作流完整场景
 */
export function setupWorkflowScenario(): void {
  setMockResponseSequence([
    // Explore phase
    [createUsageMessage('Explored codebase: found 3 files related to authentication', 50, 100)],
    // Plan generation phase
    [createUsageMessage('Generated execution plan: 1. Create auth module 2. Add JWT support', 100, 150)],
    // Execute phase
    [
      createToolMessage('Read', { file_path: '/src/auth.ts' }),
      createToolMessage('Write', { file_path: '/src/auth/jwt.ts' }),
      createUsageMessage('Authentication feature implemented successfully', 200, 400),
    ],
  ]);
}

// ============================================
// 导出
// ============================================

export { mockQuery as query };
export const Options: ReturnType<typeof vi.fn> = vi.fn();
export const AgentDefinition: ReturnType<typeof vi.fn> = vi.fn();
export const McpServerConfig: ReturnType<typeof vi.fn> = vi.fn();
