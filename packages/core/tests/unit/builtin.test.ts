/**
 * Builtin Agent 测试
 *
 * 测试内置 Agent 定义和 prompt 模板构建
 */

import { describe, it, expect } from 'vitest';
import {
  CORE_AGENTS,
  BUILTIN_AGENTS,
  getAgentConfig,
  getAllAgentNames,
} from '../../src/agents/core/agents.js';
import {
  THOROUGHNESS_PROMPTS,
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
      expect(explore.tools).toContain('file');
      expect(explore.tools).toContain('glob');
      expect(explore.tools).toContain('grep');
    });

    it('plan agent should have correct configuration', () => {
      const plan = CORE_AGENTS.plan;
      expect(plan.type).toBe('plan');
      expect(plan.tools).toContain('file');
      expect(plan.tools).toContain('glob');
      expect(plan.tools).toContain('grep');
    });

    it('general agent should have all tools', () => {
      const general = CORE_AGENTS.general;
      expect(general.type).toBe('general');
      expect(general.tools).toContain('bash');
      expect(general.tools).toContain('file');
      expect(general.tools).toContain('ask-user');
      expect(general.tools).toContain('send-file');
    });
  });

  describe('BUILTIN_AGENTS', () => {
    it('should contain all core agents', () => {
      const names = Object.keys(BUILTIN_AGENTS);
      expect(names).toContain('explore');
      expect(names).toContain('plan');
      expect(names).toContain('general');
    });

    it('should have exactly 3 agents', () => {
      expect(Object.keys(BUILTIN_AGENTS).length).toBe(3);
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

    it('getAllAgentNames should return all agent names', () => {
      const names = getAllAgentNames();
      expect(names).toHaveLength(3);
      expect(names).toEqual(expect.arrayContaining(['explore', 'plan', 'general']));
    });
  });

  describe('Prompt Templates', () => {
    it('THOROUGHNESS_PROMPTS should have all levels', () => {
      expect(THOROUGHNESS_PROMPTS.quick).toBeDefined();
      expect(THOROUGHNESS_PROMPTS.medium).toBeDefined();
      expect(THOROUGHNESS_PROMPTS['very-thorough']).toBeDefined();
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
