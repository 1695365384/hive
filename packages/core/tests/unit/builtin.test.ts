/**
 * Builtin Agent 测试
 *
 * 测试内置 Agent 定义和 prompt 模板
 */

import { describe, it, expect } from 'vitest';
import {
  CORE_AGENTS,
  EXTENDED_AGENTS,
  BUILTIN_AGENTS,
  getAgentConfig,
  getCoreAgentNames,
  getExtendedAgentNames,
  getAllAgentNames,
} from '../../src/agents/core/agents.js';
import {
  THOROUGHNESS_PROMPTS,
  EXPLORE_AGENT_PROMPT,
  PLAN_AGENT_PROMPT,
  GENERAL_AGENT_PROMPT,
  buildExplorePrompt,
  buildPlanPrompt,
} from '../../src/agents/prompts/prompts.js';

describe('Builtin Agents', () => {
  describe('CORE_AGENTS', () => {
    it('should have exactly 3 core agents', () => {
      const names = Object.keys(CORE_AGENTS);
      expect(names).toHaveLength(3);
      expect(names).toContain('explore');
      expect(names).toContain('plan');
      expect(names).toContain('general');
    });

    it('explore agent should have correct configuration', () => {
      const explore = CORE_AGENTS.explore;
      expect(explore.type).toBe('explore');
      expect(explore.tools).toContain('Read');
      expect(explore.tools).toContain('Glob');
      expect(explore.tools).toContain('Grep');
    });

    it('plan agent should have correct configuration', () => {
      const plan = CORE_AGENTS.plan;
      expect(plan.type).toBe('plan');
      expect(plan.tools).toContain('Read');
      expect(plan.tools).toContain('Glob');
      expect(plan.tools).toContain('Grep');
    });

    it('general agent should have all tools', () => {
      const general = CORE_AGENTS.general;
      expect(general.type).toBe('general');
      expect(general.tools).toContain('Read');
      expect(general.tools).toContain('Write');
      expect(general.tools).toContain('Edit');
    });

    it('all core agents should have prompts', () => {
      Object.values(CORE_AGENTS).forEach(agent => {
        expect(agent.prompt).toBeDefined();
        expect(agent.prompt!.length).toBeGreaterThan(50);
      });
    });
  });

  describe('EXTENDED_AGENTS', () => {
    it('should have extended agents', () => {
      const names = Object.keys(EXTENDED_AGENTS);
      expect(names.length).toBeGreaterThanOrEqual(3);
    });

    it('should have code-reviewer agent', () => {
      expect(EXTENDED_AGENTS['code-reviewer']).toBeDefined();
      expect(EXTENDED_AGENTS['code-reviewer'].type).toBe('code-reviewer');
    });

    it('should have test-engineer agent', () => {
      expect(EXTENDED_AGENTS['test-engineer']).toBeDefined();
      expect(EXTENDED_AGENTS['test-engineer'].type).toBe('test-engineer');
    });

    it('should have doc-writer agent', () => {
      expect(EXTENDED_AGENTS['doc-writer']).toBeDefined();
      expect(EXTENDED_AGENTS['doc-writer'].type).toBe('doc-writer');
    });
  });

  describe('BUILTIN_AGENTS', () => {
    it('should contain all core and extended agents', () => {
      const names = Object.keys(BUILTIN_AGENTS);
      expect(names).toContain('explore');
      expect(names).toContain('plan');
      expect(names).toContain('general');
      expect(names).toContain('code-reviewer');
      expect(names).toContain('test-engineer');
      expect(names).toContain('doc-writer');
    });

    it('should have at least 6 agents', () => {
      expect(Object.keys(BUILTIN_AGENTS).length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('Helper functions', () => {
    it('getAgentConfig should return config for existing agent', () => {
      const config = getAgentConfig('explore');
      expect(config).toBeDefined();
      expect(config?.type).toBe('explore');
    });

    it('getAgentConfig should return undefined for non-existing agent', () => {
      const config = getAgentConfig('non-existing');
      expect(config).toBeUndefined();
    });

    it('getCoreAgentNames should return 3 names', () => {
      const names = getCoreAgentNames();
      expect(names).toHaveLength(3);
      expect(names).toEqual(expect.arrayContaining(['explore', 'plan', 'general']));
    });

    it('getExtendedAgentNames should return extended agent names', () => {
      const names = getExtendedAgentNames();
      expect(names.length).toBeGreaterThanOrEqual(3);
    });

    it('getAllAgentNames should return all agent names', () => {
      const names = getAllAgentNames();
      expect(names.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('Prompt Templates', () => {
    it('THOROUGHNESS_PROMPTS should have all levels', () => {
      expect(THOROUGHNESS_PROMPTS.quick).toBeDefined();
      expect(THOROUGHNESS_PROMPTS.medium).toBeDefined();
      expect(THOROUGHNESS_PROMPTS['very-thorough']).toBeDefined();
    });

    it('EXPLORE_AGENT_PROMPT should be defined', () => {
      expect(EXPLORE_AGENT_PROMPT).toBeDefined();
      expect(EXPLORE_AGENT_PROMPT.length).toBeGreaterThan(100);
    });

    it('PLAN_AGENT_PROMPT should be defined', () => {
      expect(PLAN_AGENT_PROMPT).toBeDefined();
      expect(PLAN_AGENT_PROMPT.length).toBeGreaterThan(100);
    });

    it('GENERAL_AGENT_PROMPT should be defined', () => {
      expect(GENERAL_AGENT_PROMPT).toBeDefined();
      expect(GENERAL_AGENT_PROMPT.length).toBeGreaterThan(100);
    });

    it('buildExplorePrompt should include task', () => {
      const prompt = buildExplorePrompt('Find API routes', 'medium');
      expect(prompt).toContain('Find API routes');
    });

    it('buildExplorePrompt should support different thoroughness levels', () => {
      const quickPrompt = buildExplorePrompt('test', 'quick');
      const thoroughPrompt = buildExplorePrompt('test', 'very-thorough');

      expect(quickPrompt).toContain('quick');
      expect(thoroughPrompt).toContain('comprehensive');
    });

    it('buildPlanPrompt should include task', () => {
      const prompt = buildPlanPrompt('Add authentication');
      expect(prompt).toContain('Add authentication');
    });
  });
});
