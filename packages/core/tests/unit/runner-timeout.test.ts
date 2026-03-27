/**
 * 7.2 AgentExecuteOptions.timeout 子 Agent 超时测试
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
  buildExplorePrompt: vi.fn((task: string) => `Explore: ${task}`),
  buildPlanPrompt: vi.fn((task: string) => `Plan: ${task}`),
}));

// Re-mock SDK with vi.fn() that supports mockReturnValue
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
  tool: vi.fn(),
  createSdkMcpServer: vi.fn(),
  Options: vi.fn(),
  AgentDefinition: vi.fn(),
  McpServerConfig: vi.fn(),
}));

describe('AgentRunner sub-agent timeout', () => {
  let runner: AgentRunner;
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();

    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    mockQuery = vi.mocked(query);
    runner = new AgentRunner();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createSlowIterator(): AsyncGenerator<any> {
    return (async function* () {
      await new Promise(resolve => setTimeout(resolve, 60000));
      yield { type: 'result', result: 'too late' };
    })();
  }

  function createResultIterator(text: string): AsyncGenerator<any> {
    return (async function* () {
      yield { type: 'result', result: text };
    })();
  }

  it('timeout 有值时应设置 signal 到 queryOptions', async () => {
    mockQuery.mockReturnValue(createResultIterator('done'));

    const result = await runner.execute('general', 'Test', { timeout: 5000 });

    expect(mockQuery).toHaveBeenCalled();
    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options.signal).toBeInstanceOf(AbortSignal);
    expect(result.success).toBe(true);
    expect(result.text).toBe('done');
  });

  it('超时后应返回 success: false 并包含错误信息', async () => {
    mockQuery.mockReturnValue(createSlowIterator());

    vi.useFakeTimers();

    const resultPromise = runner.execute('general', 'Test', { timeout: 100 });
    await vi.advanceTimersByTimeAsync(150);

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('超时错误信息应包含超时时间', async () => {
    mockQuery.mockReturnValue(createSlowIterator());

    vi.useFakeTimers();

    const resultPromise = runner.execute('general', 'Test', { timeout: 3000 });
    await vi.advanceTimersByTimeAsync(3100);

    const result = await resultPromise;

    expect(result.error).toContain('3000ms');
  });

  it('未设置 timeout 时不应添加 signal', async () => {
    mockQuery.mockReturnValue(createResultIterator('done'));

    await runner.execute('general', 'Test');

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options.signal).toBeUndefined();
  });

  it('超时应触发 onError 回调', async () => {
    mockQuery.mockReturnValue(createSlowIterator());

    vi.useFakeTimers();

    const onError = vi.fn();
    const resultPromise = runner.execute('general', 'Test', { timeout: 100, onError });
    await vi.advanceTimersByTimeAsync(150);

    await resultPromise;

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toContain('timed out');
  });

  it('正常完成时不应触发超时', async () => {
    mockQuery.mockReturnValue(createResultIterator('completed quickly'));

    const result = await runner.execute('general', 'Test', { timeout: 5000 });

    expect(result.success).toBe(true);
    expect(result.text).toBe('completed quickly');
  });
});
