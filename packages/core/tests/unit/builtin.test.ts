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
    it('should have exactly 2 core agents', () => {
      const names = Object.keys(CORE_AGENTS);
      expect(names).toHaveLength(2);
      expect(names).toContain('explore');
      expect(names).toContain('general');
    });

    it('explore agent should have correct configuration', () => {
      const explore = CORE_AGENTS.explore;
      expect(explore.type).toBe('explore');
      expect(explore.tools).toContain('file');
      expect(explore.tools).toContain('glob');
      expect(explore.tools).toContain('grep');
      expect(explore.tools).toContain('env');
    });

    it('explore agent should have maxTurns 10', () => {
      expect(CORE_AGENTS.explore.maxTurns).toBe(10);
    });

    it('general agent should have all tools', () => {
      const general = CORE_AGENTS.general;
      expect(general.type).toBe('general');
      expect(general.tools).toContain('bash');
      expect(general.tools).toContain('file');
      expect(general.tools).toContain('ask-user');
      expect(general.tools).toContain('send-file');
      expect(general.tools).toContain('env');
    });

    it('general agent should have maxTurns 30', () => {
      expect(CORE_AGENTS.general.maxTurns).toBe(30);
    });
  });

  describe('BUILTIN_AGENTS', () => {
    it('should contain core agents', () => {
      const names = Object.keys(BUILTIN_AGENTS);
      expect(names).toContain('explore');
      expect(names).toContain('general');
    });

    it('should have exactly 2 agents', () => {
      expect(Object.keys(BUILTIN_AGENTS).length).toBe(2);
    });
  });

  describe('Alias mapping', () => {
    it('getAgentConfig("plan") returns explore config', () => {
      const config = getAgentConfig('plan');
      expect(config).toBeDefined();
      expect(config?.type).toBe('explore');
    });

    it('getAgentConfig("evaluator") returns general config', () => {
      const config = getAgentConfig('evaluator');
      expect(config).toBeDefined();
      expect(config?.type).toBe('general');
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

    it('getAllAgentNames should return core agent names only', () => {
      const names = getAllAgentNames();
      expect(names).toHaveLength(2);
      expect(names).toEqual(['explore', 'general']);
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

    it('buildPlanPrompt should delegate to buildExplorePrompt with very-thorough', () => {
      const planPrompt = buildPlanPrompt('Add authentication');
      expect(planPrompt).toContain('Add authentication');
      expect(planPrompt).toContain('comprehensive');
    });
  });
});
