/**
 * Agent 流程集成测试
 *
 * 测试 Agent 模块的导出和基本功能
 */

import { describe, it, expect } from 'vitest';
import {
  Agent,
  createAgent,
  getAgent,
  ask,
  explore,
  plan,
  general,
  runWorkflow,
  type AgentOptions,
  type WorkflowOptions,
  type WorkflowResult,
} from '../../src/agents/index.js';

describe('Agent Module Exports', () => {
  describe('Agent Class', () => {
    it('should export Agent class', () => {
      expect(Agent).toBeDefined();
      expect(typeof Agent).toBe('function');
    });

    it('should create Agent instance', () => {
      const agent = new Agent();
      expect(agent).toBeInstanceOf(Agent);
    });

    it('should have required methods', () => {
      const agent = new Agent();

      expect(typeof agent.listProviders).toBe('function');
      expect(typeof agent.useProvider).toBe('function');
      expect(typeof agent.explore).toBe('function');
      expect(typeof agent.plan).toBe('function');
      expect(typeof agent.general).toBe('function');
      expect(typeof agent.dispatch).toBe('function');
      // Verify dispatch returns a Promise (actual DispatchResult structure is validated in dispatcher unit tests)
      const dispatchResult = agent.dispatch('test');
      expect(dispatchResult).toBeInstanceOf(Promise);
      // Note: dispatch will reject without agent.initialize() — expected behavior
      dispatchResult.catch(() => {}); // prevent unhandled rejection warning
    });
  });

  describe('Factory Functions', () => {
    it('should export createAgent', () => {
      expect(createAgent).toBeDefined();
      expect(typeof createAgent).toBe('function');
    });

    it('createAgent should return new Agent instance', () => {
      const agent1 = createAgent();
      const agent2 = createAgent();

      expect(agent1).toBeInstanceOf(Agent);
      expect(agent2).toBeInstanceOf(Agent);
      expect(agent1).not.toBe(agent2);
    });

    it('should export getAgent', () => {
      expect(getAgent).toBeDefined();
      expect(typeof getAgent).toBe('function');
    });

    it('getAgent should return same global instance', () => {
      const agent1 = getAgent();
      const agent2 = getAgent();

      expect(agent1).toBe(agent2);
    });
  });

  describe('Convenience Functions', () => {
    it('should export ask function', () => {
      expect(ask).toBeDefined();
      expect(typeof ask).toBe('function');
    });

    it('should export explore function', () => {
      expect(explore).toBeDefined();
      expect(typeof explore).toBe('function');
    });

    it('should export plan function', () => {
      expect(plan).toBeDefined();
      expect(typeof plan).toBe('function');
    });

    it('should export general function', () => {
      expect(general).toBeDefined();
      expect(typeof general).toBe('function');
    });

    it('should export runWorkflow function', () => {
      expect(runWorkflow).toBeDefined();
      expect(typeof runWorkflow).toBe('function');
    });
  });

  describe('Type Exports', () => {
    it('should export AgentOptions type', () => {
      const options: AgentOptions = {
        cwd: '/test',
        maxTurns: 10,
      };
      expect(options).toBeDefined();
    });

    it('should export WorkflowOptions type', () => {
      const options: WorkflowOptions = {
        cwd: '/test',
      };
      expect(options).toBeDefined();
    });

    it('should export WorkflowResult type', () => {
      const result: WorkflowResult = {
        success: true,
        analysis: {
          type: 'simple',
          needsExploration: true,
          needsPlanning: false,
          recommendedAgents: ['explore'],
          reason: 'Test',
        },
      };
      expect(result).toBeDefined();
    });
  });
});

describe('Prompt Template Exports', () => {
  it('should export THOROUGHNESS_PROMPTS', async () => {
    const { THOROUGHNESS_PROMPTS } = await import('../../src/agents/index.js');
    expect(THOROUGHNESS_PROMPTS).toBeDefined();
    expect(THOROUGHNESS_PROMPTS.quick).toBeDefined();
    expect(THOROUGHNESS_PROMPTS.medium).toBeDefined();
    expect(THOROUGHNESS_PROMPTS['very-thorough']).toBeDefined();
  });

  it('should export buildExplorePrompt', async () => {
    const { buildExplorePrompt } = await import('../../src/agents/index.js');
    expect(buildExplorePrompt).toBeDefined();
    expect(typeof buildExplorePrompt).toBe('function');

    const prompt = buildExplorePrompt('Test task', 'medium');
    expect(prompt).toContain('Test task');
  });

  it('should export buildPlanPrompt', async () => {
    const { buildPlanPrompt } = await import('../../src/agents/index.js');
    expect(buildPlanPrompt).toBeDefined();
    expect(typeof buildPlanPrompt).toBe('function');

    const prompt = buildPlanPrompt('Test plan');
    expect(prompt).toContain('Test plan');
  });
});
