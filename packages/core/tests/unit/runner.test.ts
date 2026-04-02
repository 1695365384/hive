/**
 * Agent Runner 测试
 *
 * 测试子 Agent 执行器
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentRunner, createAgentRunner } from '../../src/agents/core/runner.js';

// Mock the agents module
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

// Mock the prompts module
vi.mock('../../src/agents/prompts/prompts.js', () => ({
  EXPLORE_AGENT_PROMPT: 'You are an exploration agent.',
  PLAN_AGENT_PROMPT: 'You are a planning agent.',
  GENERAL_AGENT_PROMPT: 'You are a general-purpose agent.',
  buildExplorePrompt: vi.fn((task: string) => `Explore: ${task}`),
  buildPlanPrompt: vi.fn((task: string) => `Plan: ${task}`),
}));

// Mock AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: 'Mock LLM response',
    steps: [],
    totalUsage: { inputTokens: 50, outputTokens: 100 },
    finishReason: 'stop',
  }),
  streamText: vi.fn(),
  stepCountIs: vi.fn((n: number) => n),
  tool: vi.fn((config: Record<string, unknown>) => config),
  zodSchema: vi.fn((schema: unknown) => schema),
}));

// Mock ProviderManager - provide getModel() for LLMRuntime
vi.mock('../../src/providers/ProviderManager.js', () => ({
  createProviderManager: vi.fn(() => ({
    getModel: vi.fn().mockReturnValue({ modelId: 'mock-model' }),
    getModelForProvider: vi.fn().mockReturnValue({ modelId: 'mock-model' }),
    getModelWithSpec: vi.fn().mockResolvedValue({ model: { modelId: 'mock-model' }, spec: null }),
    active: {
      id: 'mock',
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      model: 'mock-model',
    },
  })),
  ProviderManager: vi.fn().mockImplementation(() => ({
    getModel: vi.fn().mockReturnValue({ modelId: 'mock-model' }),
    getModelForProvider: vi.fn().mockReturnValue({ modelId: 'mock-model' }),
    getModelWithSpec: vi.fn().mockResolvedValue({ model: { modelId: 'mock-model' }, spec: null }),
    active: {
      id: 'mock',
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      model: 'mock-model',
    },
  })),
}));

describe('AgentRunner', () => {
  let runner: AgentRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new AgentRunner();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create runner without provider manager', () => {
      const r = new AgentRunner();
      expect(r).toBeDefined();
      expect(r).toBeInstanceOf(AgentRunner);
    });

    it('should create runner with provider manager', () => {
      const providerManager = {
        getModel: vi.fn().mockReturnValue({ modelId: 'mock-model' }),
        getModelForProvider: vi.fn().mockReturnValue({ modelId: 'mock-model' }),
        getModelWithSpec: vi.fn().mockResolvedValue({ model: { modelId: 'mock-model' }, spec: null }),
        active: {
          id: 'mock',
          baseUrl: 'https://api.test.com',
          apiKey: 'test-key',
          model: 'mock-model',
        },
      } as any;

      const r = new AgentRunner(providerManager);
      expect(r).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should return error for unknown agent', async () => {
      const result = await runner.execute('unknown-agent', 'Test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown agent');
      expect(result.text).toBe('');
    });

    it('should return result for explore agent', async () => {
      const result = await runner.execute('explore', 'Test task');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.text).toBe('Mock LLM response');
    });

    it('should return result for plan agent', async () => {
      const result = await runner.execute('plan', 'Test task');
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should return result for general agent', async () => {
      const result = await runner.execute('general', 'Test task');
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('convenience methods', () => {
    it('explore should call execute with explore agent', async () => {
      const result = await runner.explore('Find files');
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

  });
});

describe('createAgentRunner', () => {
  it('should create new runner instance', () => {
    const runner = createAgentRunner();
    expect(runner).toBeInstanceOf(AgentRunner);
  });

  it('should accept provider manager', () => {
    const providerManager = {
      getModel: vi.fn().mockReturnValue({ modelId: 'mock-model' }),
      getModelWithSpec: vi.fn().mockResolvedValue({ model: { modelId: 'mock-model' }, spec: null }),
      active: null,
    } as any;
    const runner = createAgentRunner(providerManager);
    expect(runner).toBeInstanceOf(AgentRunner);
  });
});
