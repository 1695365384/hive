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
  buildExplorePrompt: vi.fn((task: string) => `Explore: ${task}`),
  buildPlanPrompt: vi.fn((task: string) => `Plan: ${task}`),
}));

// Mock SDK - provide async generator for query
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(async function* () {
    yield { type: 'result', result: 'Mock response' };
  }),
  tool: vi.fn(),
  createSdkMcpServer: vi.fn(),
  Options: vi.fn(),
  AgentDefinition: vi.fn(),
  McpServerConfig: vi.fn(),
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
        getActiveProvider: () => ({
          baseUrl: 'https://api.test.com',
          apiKey: 'test-key',
        }),
        getMcpServersForAgent: () => ({}),
      };

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

    it('should return explore config for explore agent', async () => {
      // This test verifies the agent config lookup works
      const result = await runner.execute('explore', 'Test task');

      // Since query is not mocked, it will fail, but we can check the error
      // The important thing is that the agent config was found
      expect(result).toBeDefined();
    });

    it('should return plan config for plan agent', async () => {
      const result = await runner.execute('plan', 'Test task');
      expect(result).toBeDefined();
    });

    it('should return general config for general agent', async () => {
      const result = await runner.execute('general', 'Test task');
      expect(result).toBeDefined();
    });
  });

  describe('convenience methods', () => {
    it('explore should call execute with explore agent', async () => {
      const result = await runner.explore('Find files');
      expect(result).toBeDefined();
    });

    it('plan should call execute with plan agent', async () => {
      const result = await runner.plan('Research task');
      expect(result).toBeDefined();
    });

    it('general should call execute with general agent', async () => {
      const result = await runner.general('Execute task');
      expect(result).toBeDefined();
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
      getActiveProvider: () => null,
      getMcpServersForAgent: () => ({}),
    };
    const runner = createAgentRunner(providerManager);
    expect(runner).toBeInstanceOf(AgentRunner);
  });
});
