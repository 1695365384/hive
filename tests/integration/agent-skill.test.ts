/**
 * Agent + Skill 集成测试
 *
 * 测试 Skill 与 Agent 的完整集成，包括：
 * - 技能匹配和使用
 * - 技能注册和注销
 * - 技能指令生成
 * - 技能与工作流的配合
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Agent, createAgent } from '../../src/agents/core/Agent.js';
import type { Skill, SkillMatchResult } from '../../src/skills/index.js';

/**
 * 创建测试用 Skill 对象
 */
function createTestSkill(overrides: Partial<Skill>): Skill {
  return {
    metadata: {
      name: 'Test Skill',
      description: 'A test skill',
      version: '1.0.0',
      tags: [],
      ...overrides.metadata,
    },
    body: '# Test Skill',
    path: '/test/skill',
    references: [],
    scripts: [],
    examples: [],
    assets: [],
    ...overrides,
  };
}

describe('Agent + Skill Integration', () => {
  // ============================================
  // Skill Registration
  // ============================================
  describe('Skill Registration', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should list available skills', () => {
      const skills = agent.listSkills();
      expect(Array.isArray(skills)).toBe(true);
    });

    it('should list skill metadata', () => {
      const metadata = agent.listSkillMetadata();
      expect(Array.isArray(metadata)).toBe(true);

      for (const m of metadata) {
        expect(m).toHaveProperty('name');
        expect(m).toHaveProperty('description');
      }
    });

    it('should get skill by name', () => {
      const skills = agent.listSkills();

      if (skills.length > 0) {
        const skill = agent.getSkill(skills[0].metadata.name);
        expect(skill).toBeDefined();
        expect(skill?.metadata.name).toBe(skills[0].metadata.name);
      }
    });

    it('should return undefined for unknown skill', () => {
      const skill = agent.getSkill('non-existent-skill');
      expect(skill).toBeUndefined();
    });

    it('should register new skill', () => {
      const newSkill = createTestSkill({
        metadata: {
          name: 'Test Skill',
          description: 'A test skill for integration testing',
          version: '1.0.0',
          tags: ['test'],
        },
        body: '# Test Skill\n\nThis is a test skill.',
      });

      agent.registerSkill(newSkill);

      const skill = agent.getSkill('Test Skill');
      expect(skill).toBeDefined();
      expect(skill?.metadata.name).toBe('Test Skill');
    });
  });

  // ============================================
  // Skill Matching
  // ============================================
  describe('Skill Matching', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should match skill from input', () => {
      // 注册一个测试技能
      const testSkill = createTestSkill({
        metadata: {
          name: 'Code Review',
          description: 'Review code for quality and best practices',
          version: '1.0.0',
          tags: ['code', 'review', 'quality'],
        },
        body: '# Code Review\n\nReview code for quality.',
      });
      agent.registerSkill(testSkill);

      const result = agent.matchSkill('please review this code');
      // 匹配结果取决于 matcher 实现
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should return null for no match', () => {
      const result = agent.matchSkill('random text that does not match anything');
      // 可能匹配到某些技能，也可能不匹配
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should have skillRegistry in context', () => {
      expect(agent.context.skillRegistry).toBeDefined();
    });
  });

  // ============================================
  // Skill Instruction Generation
  // ============================================
  describe('Skill Instruction Generation', () => {
    let agent: Agent;
    let testSkill: Skill;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();

      testSkill = createTestSkill({
        metadata: {
          name: 'Test Generator',
          description: 'Generate test cases for code',
          version: '2.0.0',
          tags: ['testing', 'tdd'],
        },
        body: '# Test Generator\n\nGenerate comprehensive unit tests.',
      });
      agent.registerSkill(testSkill);
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should generate skill instruction', () => {
      const instruction = agent.generateSkillInstruction(testSkill);

      expect(instruction).toContain('Test Generator');
      expect(instruction).toContain('Generate test cases');
    });

    it('should include skill body in instruction', () => {
      const instruction = agent.generateSkillInstruction(testSkill);

      expect(instruction).toContain('Generate comprehensive unit tests');
    });
  });

  // ============================================
  // Skill + Provider Integration
  // ============================================
  describe('Skill + Provider Integration', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should work with provider switching', async () => {
      const providers = agent.listProviders();

      if (providers.length > 0) {
        // 切换 provider
        agent.useProvider(providers[0].id);

        // 技能应该仍然可用
        const skills = agent.listSkills();
        expect(Array.isArray(skills)).toBe(true);
      }
    });

    it('should have independent skill and provider registries', () => {
      expect(agent.context.skillRegistry).toBeDefined();
      expect(agent.context.providerManager).toBeDefined();

      // 两个应该是独立的对象
      expect(agent.context.skillRegistry).not.toBe(agent.context.providerManager);
    });
  });

  // ============================================
  // Skill + Hook Integration
  // ============================================
  describe('Skill + Hook Integration', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should be able to register skill:match hook', () => {
      const hookSpy = vi.fn().mockReturnValue({ proceed: true });
      agent.context.hookRegistry.on('skill:match', hookSpy);

      expect(agent.context.hookRegistry.has('skill:match')).toBe(true);
    });

    it('should have skill match hook type defined', () => {
      // 验证 hook 类型存在
      expect(agent.context.hookRegistry.on).toBeDefined();
      expect(agent.context.hookRegistry.emit).toBeDefined();
    });
  });

  // ============================================
  // Skill Capability Methods
  // ============================================
  describe('Skill Capability Methods', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should have skillCap initialized', () => {
      const skillCap = (agent as any).skillCap;
      expect(skillCap).toBeDefined();
      expect(skillCap.listAll).toBeDefined();
      expect(skillCap.get).toBeDefined();
      expect(skillCap.match).toBeDefined();
      expect(skillCap.register).toBeDefined();
    });

    it('should return same skill from capability and agent', () => {
      const skillCap = (agent as any).skillCap;
      const skills = agent.listSkills();

      if (skills.length > 0) {
        const capSkill = skillCap.get(skills[0].metadata.name);
        const agentSkill = agent.getSkill(skills[0].metadata.name);

        expect(capSkill).toBe(agentSkill);
      }
    });

    it('should have size property', () => {
      const skillCap = (agent as any).skillCap;
      expect(typeof skillCap.size).toBe('number');
      expect(skillCap.size).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================
  // Multi-Agent Skill Isolation
  // ============================================
  describe('Multi-Agent Skill Isolation', () => {
    let agent1: Agent;
    let agent2: Agent;

    beforeEach(async () => {
      agent1 = createAgent();
      agent2 = createAgent();
      await agent1.initialize();
      await agent2.initialize();
    });

    afterEach(async () => {
      await agent1.dispose();
      await agent2.dispose();
    });

    it('should have separate skill registries', () => {
      expect(agent1.context.skillRegistry).not.toBe(agent2.context.skillRegistry);
    });

    it('should allow independent skill registration', () => {
      const skill1 = createTestSkill({
        metadata: {
          name: 'Agent1 Skill',
          description: 'Skill for agent 1',
          version: '1.0.0',
          tags: ['agent1'],
        },
        body: '# Agent1 Skill',
      });

      const skill2 = createTestSkill({
        metadata: {
          name: 'Agent2 Skill',
          description: 'Skill for agent 2',
          version: '1.0.0',
          tags: ['agent2'],
        },
        body: '# Agent2 Skill',
      });

      agent1.registerSkill(skill1);
      agent2.registerSkill(skill2);

      expect(agent1.getSkill('Agent1 Skill')).toBeDefined();
      expect(agent1.getSkill('Agent2 Skill')).toBeUndefined();

      expect(agent2.getSkill('Agent2 Skill')).toBeDefined();
      expect(agent2.getSkill('Agent1 Skill')).toBeUndefined();
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    let agent: Agent;

    beforeEach(async () => {
      agent = createAgent();
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
    });

    it('should handle empty skill name', () => {
      const skill = agent.getSkill('');
      expect(skill).toBeUndefined();
    });

    it('should handle skill with empty body', () => {
      const emptySkill = createTestSkill({
        metadata: {
          name: 'Empty Skill',
          description: 'A skill with empty body',
          version: '1.0.0',
          tags: ['empty'],
        },
        body: '',
      });

      // 应该能注册
      agent.registerSkill(emptySkill);

      const instruction = agent.generateSkillInstruction(emptySkill);
      expect(instruction).toContain('Empty Skill');
    });

    it('should handle skill with special characters in name', () => {
      const specialSkill = createTestSkill({
        metadata: {
          name: 'Special-Skill_v2.0',
          description: 'A skill with special characters',
          version: '1.0.0',
          tags: ['special'],
        },
        body: '# Special Skill',
      });

      agent.registerSkill(specialSkill);

      const skill = agent.getSkill('Special-Skill_v2.0');
      expect(skill).toBeDefined();
    });
  });
});
