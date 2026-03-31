/**
 * 集成测试共享基础设施
 *
 * 提供智能 AI SDK mock、Agent 生命周期管理、场景预设、断言增强。
 * Mock 结构严格对齐 hive-core 实际使用的 AI SDK 接口（LLMRuntime.ts）。
 *
 * 使用方式:
 *   import { createMockAI, createTestAgent, withAgent, ... } from './integration-helpers.js';
 *   const { mockGenerateText, mockStreamText } = createMockAI(responses);
 *   vi.mock('ai', () => ({ generateText: mockGenerateText, streamText: mockStreamText }));
 */

import { vi, expect } from 'vitest';
import type { Agent } from '../../src/agents/core/index.js';

// ============================================
// Mock Provider — 让 LLMRuntime.resolveModelWithSpec() 通过
// ============================================

/**
 * 创建 fake LanguageModelV3 用于 mock Provider
 *
 * LLMRuntime.resolveModelWithSpec() 需要返回一个 model 实例，
 * 否则会报 "No available model" 错误。
 */
export function createFakeModel(): Record<string, unknown> {
  return {
    modelId: 'mock-model',
    provider: 'mock-provider',
    specificationVersion: 'v3',
    defaultObjectGenerationMode: 'json',
    supportedObjectModes: ['json', 'tool', 'grammar'],
    maxEmbeddingsPerCall: 1,
  };
}

/**
 * Mock ProviderManager — 让 Agent 可以正常初始化
 *
 * 在集成测试文件中配合 vi.mock 使用:
 *   vi.mock('../../src/providers/ProviderManager.js', () => createMockProviderManagerModule());
 */
export function createMockProviderManagerModule() {
  const fakeModel = createFakeModel();

  const createMockInstance = () => ({
    // Properties
    active: null,
    all: [],

    // Core methods used by LLMRuntime
    getModelWithSpec: vi.fn().mockResolvedValue({ model: fakeModel, spec: null }),
    getModelForProvider: vi.fn().mockResolvedValue(fakeModel),
    getModel: vi.fn().mockResolvedValue(fakeModel),

    // Provider management methods
    switch: vi.fn().mockReturnValue(false),
    reResolveAll: vi.fn(),

    // Lifecycle
    dispose: vi.fn(),
  });

  // ProviderManager 需要是可构造的 class
  class MockProviderManager {
    constructor() {
      Object.assign(this, createMockInstance());
    }
  }

  return {
    ProviderManager: MockProviderManager,
    createProviderManager: vi.fn().mockImplementation(() => createMockInstance()),
  };
}

// ============================================
// Types — 对齐 LLMRuntime.ts 实际使用的结构
// ============================================

/** generateText mock 响应（对齐 AI SDK generateText 返回值） */
export interface MockGenerateTextResponse {
  text: string;
  steps?: MockStep[];
  finishReason?: string;
  totalUsage?: { inputTokens: number; outputTokens: number };
}

/** streamText 中的 step（对齐 AI SDK） */
export interface MockStep {
  toolCalls?: Array<{ toolName: string; input: unknown }>;
  toolResults?: Array<{ toolName: string; output: unknown }>;
  finishReason?: string | null;
  text?: string;
}

/** streamText fullStream 的 chunk 类型 */
export type StreamChunk =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolName: string; input: unknown }
  | { type: 'tool-result'; toolName: string; output: unknown }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'finish-step'; finishReason: string | null }
  | { type: 'start' }
  | { type: 'finish'; finishReason: string; totalUsage?: { inputTokens: number; outputTokens: number } };

/** 智能 mock 的配置项 */
export interface MockAIConfig {
  /** 响应序列（支持多轮调用） */
  responses: MockGenerateTextResponse[];
  /** 是否模拟流式响应（默认 false，用 generateText） */
  streaming?: boolean;
  /** 模拟延迟（ms，默认 0） */
  delay?: number;
}

// ============================================
// 1. 智能 AI SDK Mock 工厂
// ============================================

/**
 * 创建智能 AI SDK mock
 *
 * 返回可在 vi.mock('ai', ...) 中使用的 mock 函数。
 * 支持纯文本响应、工具调用响应、多轮对话序列。
 */
export function createMockAI(config: MockAIConfig) {
  const { responses, delay = 0 } = config;
  let callIndex = 0;

  const resolveResponse = (index: number): MockGenerateTextResponse => {
    const idx = Math.min(index, responses.length - 1);
    const resp = responses[idx];
    return {
      text: resp.text ?? '',
      steps: resp.steps ?? [],
      finishReason: resp.finishReason ?? 'stop',
      totalUsage: resp.totalUsage ?? { inputTokens: 50, outputTokens: 25 },
    };
  };

  const wait = () => delay > 0 ? new Promise(r => setTimeout(r, delay)) : Promise.resolve();

  // --- generateText mock ---
  const mockGenerateText = vi.fn().mockImplementation(async (..._args: unknown[]) => {
    await wait();
    const resp = resolveResponse(callIndex);
    callIndex++;
    return resp;
  });

  // --- streamText mock ---
  function* buildStreamChunks(resp: MockGenerateTextResponse): Generator<StreamChunk> {
    yield { type: 'start' };

    // 如果有 steps 且包含 toolCalls，先 yield tool-call chunks
    for (const step of resp.steps ?? []) {
      for (const tc of step.toolCalls ?? []) {
        yield { type: 'tool-call', toolName: tc.toolName, input: tc.input };
      }
      for (const tr of step.toolResults ?? []) {
        yield { type: 'tool-result', toolName: tr.toolName, output: tr.output };
      }
      if (step.finishReason !== undefined) {
        yield { type: 'finish-step', finishReason: step.finishReason };
      }
    }

    // 最后 yield 文本
    if (resp.text) {
      yield { type: 'text-delta', text: resp.text };
    }

    yield {
      type: 'finish',
      finishReason: resp.finishReason ?? 'stop',
      totalUsage: resp.totalUsage,
    };
  }

  const mockStreamText = vi.fn().mockImplementation((..._args: unknown[]) => {
    const resp = resolveResponse(callIndex);
    callIndex++;

    const chunks = Array.from(buildStreamChunks(resp));
    const fullStream = (async function* () {
      await wait();
      for (const chunk of chunks) {
        yield chunk;
      }
    })();

    return {
      fullStream,
      text: Promise.resolve(resp.text),
      finishReason: Promise.resolve(resp.finishReason ?? 'stop'),
      steps: Promise.resolve(resp.steps ?? []),
      totalUsage: Promise.resolve(resp.totalUsage),
    };
  });

  return {
    mockGenerateText,
    mockStreamText,
    /** 获取当前调用次数 */
    getCallCount: () => callIndex,
    /** 重置调用计数 */
    resetCallCount: () => { callIndex = 0; },
  };
}

// ============================================
// 2. 场景预设
// ============================================

/** 纯文本 chat 响应 */
export function simpleTextResponse(text: string): MockGenerateTextResponse {
  return { text, steps: [], finishReason: 'stop' };
}

/** 包含工具调用的响应（一个 step，一个 toolCall） */
export function toolCallResponse(
  toolName: string,
  args: Record<string, unknown>,
  toolOutput: unknown,
  finalText: string = '',
): MockGenerateTextResponse {
  return {
    text: finalText,
    steps: [
      {
        toolCalls: [{ toolName, input: args }],
        toolResults: [{ toolName, output: toolOutput }],
        finishReason: 'tool-calls',
      },
    ],
    finishReason: finalText ? 'stop' : 'tool-calls',
  };
}

/** 多步响应：工具调用 → 最终文本 */
export function multiStepResponse(
  toolSteps: Array<{ toolName: string; args: Record<string, unknown>; output: unknown }>,
  finalText: string,
): MockGenerateTextResponse {
  return {
    text: finalText,
    steps: [
      ...toolSteps.map(s => ({
        toolCalls: [{ toolName: s.toolName, input: s.args }],
        toolResults: [{ toolName: s.toolName, output: s.output }],
        finishReason: 'tool-calls' as const,
      })),
      { text: finalText, toolCalls: [], toolResults: [], finishReason: 'stop' },
    ],
    finishReason: 'stop',
  };
}

// ============================================
// 3. Agent 生命周期管理
// ============================================

/**
 * 创建测试用 Agent 实例并初始化
 *
 * 返回 { agent, dispose }，调用方需手动 dispose。
 * 推荐 withAgent() 自动管理生命周期。
 */
export async function createTestAgent(): Promise<{ agent: Agent; dispose: () => Promise<void> }> {
  const { createAgent } = await import('../../src/agents/core/index.js');
  const agent = createAgent();
  await agent.initialize();
  return {
    agent,
    dispose: async () => {
      try { await agent.dispose(); } catch { /* ignore */ }
    },
  };
}

/**
 * 回调模式管理 Agent 生命周期
 *
 * 自动 createAgent → initialize → callback → dispose。
 * 即使 callback 抛异常，dispose 仍会被调用。
 *
 * @example
 * const result = await withAgent(async (agent) => {
 *   return agent.chat('hello');
 * });
 */
export async function withAgent<T>(callback: (agent: Agent) => Promise<T>): Promise<T> {
  const { agent, dispose } = await createTestAgent();
  try {
    return await callback(agent);
  } finally {
    await dispose();
  }
}

// ============================================
// 4. 断言增强
// ============================================

/**
 * 验证 mockGenerateText 被调用
 */
export function assertMockCalled(mockGenerateText: ReturnType<typeof vi.fn>, times?: number): void {
  expect(mockGenerateText).toHaveBeenCalled();
  if (times !== undefined) {
    expect(mockGenerateText).toHaveBeenCalledTimes(times);
  }
}

/**
 * 验证 mockGenerateText 被调用时携带特定 prompt
 */
export function assertPromptContains(mockGenerateText: ReturnType<typeof vi.fn>, partial: string): void {
  expect(mockGenerateText).toHaveBeenCalled();
  const callArgs = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
  const prompt = (callArgs?.prompt as string) ?? '';
  const messages = callArgs?.messages as Array<{ role: string; content: string }> | undefined;
  const allText = prompt + (messages ?? []).map(m => m.content).join(' ');
  expect(allText).toContain(partial);
}

/**
 * 验证 mockGenerateText 调用时 messages 包含历史消息
 */
export function assertHistoryLength(mockGenerateText: ReturnType<typeof vi.fn>, minMessages: number): void {
  expect(mockGenerateText).toHaveBeenCalled();
  const callArgs = mockGenerateText.mock.calls[0][0] as Record<string, unknown>;
  const messages = callArgs?.messages as Array<unknown> | undefined;
  expect(messages?.length ?? 0).toBeGreaterThanOrEqual(minMessages);
}

/**
 * 验证 hook spy 被调用且参数包含特定字段
 */
export function assertHookFired(
  hookSpy: ReturnType<typeof vi.fn>,
  expectedFields?: Record<string, unknown>,
): void {
  expect(hookSpy).toHaveBeenCalled();
  if (expectedFields) {
    const lastCall = hookSpy.mock.calls[hookSpy.mock.calls.length - 1];
    if (lastCall.length > 0) {
      expect(lastCall[0]).toMatchObject(expectedFields);
    }
  }
}

/**
 * 验证 session 已保存（通过 MockSessionRepository 或 SessionRepository）
 */
export async function assertSessionSaved(repository: { exists: (id: string) => boolean }, sessionId?: string): Promise<void> {
  if (sessionId) {
    expect(repository.exists(sessionId)).toBe(true);
  }
}
