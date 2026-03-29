/**
 * Agent Runner 超时测试
 *
 * 验证子 Agent 执行超时返回错误
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentRunner } from '../../src/agents/core/runner.js';

// Mock agents module
vi.mock('../../src/agents/core/agents.js', () => ({
  getAgentConfig: vi.fn((name: string) => {
    if (['explore', 'plan', 'general'].includes(name)) {
      return {
        type: name,
        prompt: `You are a ${name} agent.`,
        tools: ['Read', 'Glob', 'Grep'],
        maxTurns: 10,
      };
    }
    return undefined;
  }),
}));

// Mock prompts module
vi.mock('../../src/agents/prompts/prompts.js', () => ({
  EXPLORE_AGENT_PROMPT: 'You are an exploration agent.',
  PLAN_AGENT_PROMPT: 'You are a planning agent.',
  GENERAL_AGENT_PROMPT: 'You are a general-purpose agent.',
  buildExplorePrompt: vi.fn((task: string) => `Explore: ${task}`),
  buildPlanPrompt: vi.fn((task: string) => `Plan: ${task}`),
}));

// Mock ProviderManager
vi.mock('../../src/providers/ProviderManager.js', () => ({
  createProviderManager: vi.fn(() => ({
    getModel: vi.fn().mockReturnValue({ modelId: 'mock-model' }),
    getModelForProvider: vi.fn().mockReturnValue({ modelId: 'mock-model' }),
  })),
  ProviderManager: vi.fn().mockImplementation(() => ({
    getModel: vi.fn().mockReturnValue({ modelId: 'mock-model' }),
    getModelForProvider: vi.fn().mockReturnValue({ modelId: 'mock-model' }),
  })),
}));

describe('AgentRunner sub-agent timeout', () => {
  let runner: AgentRunner;
  let mockGenerateText: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();

    const { generateText } = await import('ai');
    mockGenerateText = vi.mocked(generateText);
    runner = new AgentRunner();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('timeout 有值时应设置 abortSignal 到 generateText', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'done',
      steps: [],
      totalUsage: { inputTokens: 10, outputTokens: 20 },
      finishReason: 'stop',
    });

    const result = await runner.execute('general', 'Test', { timeout: 5000 });

    expect(mockGenerateText).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.text).toBe('done');
  });

  it('超时后应返回 success: false 并包含错误信息', async () => {
    mockGenerateText.mockReturnValue(new Promise(() => {})); // never resolves

    vi.useFakeTimers();

    const resultPromise = runner.execute('general', 'Test', { timeout: 100 });
    await vi.advanceTimersByTimeAsync(150);

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('超时错误信息应包含超时时间', async () => {
    mockGenerateText.mockReturnValue(new Promise(() => {}));

    vi.useFakeTimers();

    const resultPromise = runner.execute('general', 'Test', { timeout: 3000 });
    await vi.advanceTimersByTimeAsync(3100);

    const result = await resultPromise;

    expect(result.error).toContain('3000ms');
  });

  it('未设置 timeout 时正常执行', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'done',
      steps: [],
      totalUsage: { inputTokens: 10, outputTokens: 20 },
      finishReason: 'stop',
    });

    const result = await runner.execute('general', 'Test');

    expect(result.success).toBe(true);
    expect(result.text).toBe('done');
  });

  it('超时应触发 onError 回调', async () => {
    mockGenerateText.mockReturnValue(new Promise(() => {}));

    vi.useFakeTimers();

    const onError = vi.fn();
    const resultPromise = runner.execute('general', 'Test', { timeout: 100, onError });
    await vi.advanceTimersByTimeAsync(150);

    await resultPromise;

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toContain('timed out');
  });

  it('正常完成时不应触发超时', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'completed quickly',
      steps: [],
      totalUsage: { inputTokens: 10, outputTokens: 20 },
      finishReason: 'stop',
    });

    const result = await runner.execute('general', 'Test', { timeout: 5000 });

    expect(result.success).toBe(true);
    expect(result.text).toBe('completed quickly');
  });
});
