/**
 * SkillCapability 单元测试
 *
 * 测试技能管理能力
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillCapability } from '../../../src/agents/capabilities/SkillCapability.js';
import {
  createMockAgentContext,
  createTestSkill,
} from '../../mocks/agent-context.mock.js';
import type { AgentContext } from '../../../src/agents/core/types.js';
import type { Skill, SkillMatchResult } from '../../../src/skills/index.js';

describe('SkillCapability', () => {
  let capability: SkillCapability;
  let context: AgentContext;

  // 测试用技能
  const codeReviewSkill = createTestSkill({
    metadata: {
      name: 'Code Review',
      description: 'Used when user asks to review code quality',
      version: '1.0.0',
      tags: ['code-quality', 'review'],
    },
    body: '# Code Review Skill\n\nReview code for quality and best practices.',
  });

  const testSkill = createTestSkill({
    metadata: {
      name: 'Test Generator',
      description: 'Generate unit tests for code',
      version: '1.0.0',
      tags: ['testing', 'tdd'],
    },
    body: '# Test Generator\n\nGenerate comprehensive unit tests.',
  });

  // 匹配结果
  const mockMatchResult: SkillMatchResult = {
    skill: codeReviewSkill,
    matchedPhrase: 'review code',
    matchIndex: 0,
  };

  beforeEach(() => {
    capability = new SkillCapability();
    context = createMockAgentContext({
      skills: [codeReviewSkill, testSkill],
      skillMatchResult: mockMatchResult,
    });
    capability.initialize(context);
  });

  // ============================================
  // 生命周期测试
  // ============================================

  describe('生命周期', () => {
    it('should initialize correctly', () => {
      expect(capability.name).toBe('skill');
    });

    it('should have correct name', () => {
      expect(capability.name).toBe('skill');
    });
  });

  // ============================================
  // listAll() 测试
  // ============================================

  describe('listAll()', () => {
    it('should list all skills', () => {
      const skills = capability.listAll();
      expect(skills).toHaveLength(2);
      expect(skills).toContainEqual(codeReviewSkill);
      expect(skills).toContainEqual(testSkill);
    });

    it('should return empty array when no skills', () => {
      const emptyContext = createMockAgentContext({ skills: [] });
      const emptyCapability = new SkillCapability();
      emptyCapability.initialize(emptyContext);

      expect(emptyCapability.listAll()).toEqual([]);
    });
  });

  // ============================================
  // listMetadata() 测试
  // ============================================

  describe('listMetadata()', () => {
    it('should list all skill metadata', () => {
      const metadata = capability.listMetadata();

      expect(metadata).toHaveLength(2);
      expect(metadata[0].name).toBeDefined();
      expect(metadata[0].description).toBeDefined();
      expect(metadata[0].version).toBeDefined();
    });

    it('should return only metadata, not full skill body', () => {
      const metadata = capability.listMetadata();

      metadata.forEach(m => {
        expect(m).not.toHaveProperty('body');
      });
    });
  });

  // ============================================
  // get() 测试
  // ============================================

  describe('get()', () => {
    it('should get skill by name', () => {
      const skill = capability.get('Code Review');
      expect(skill).toEqual(codeReviewSkill);
    });

    it('should be case-insensitive', () => {
      const skill = capability.get('code review');
      expect(skill).toEqual(codeReviewSkill);
    });

    it('should return undefined for unknown skill', () => {
      const skill = capability.get('Unknown Skill');
      expect(skill).toBeUndefined();
    });
  });

  // ============================================
  // match() 测试
  // ============================================

  describe('match()', () => {
    it('should match skill from input', async () => {
      const result = await capability.match('请帮我 review 代码');

      expect(result).not.toBeNull();
      expect(result?.skill.metadata.name).toBe('Code Review');
    });

    it('should trigger skill:match hook on match', async () => {
      await capability.match('请帮我 review 代码', 'session-123');

      expect(context.hookRegistry.emit).toHaveBeenCalledWith(
        'skill:match',
        expect.objectContaining({
          sessionId: 'session-123',
          matchedSkill: 'Code Review',
        })
      );
    });

    it('should use default session ID when not provided', async () => {
      await capability.match('请帮我 review 代码');

      expect(context.hookRegistry.emit).toHaveBeenCalledWith(
        'skill:match',
        expect.objectContaining({
          sessionId: 'system',
        })
      );
    });

    it('should not trigger hook when no match', async () => {
      const noMatchContext = createMockAgentContext({
        skills: [codeReviewSkill],
        skillMatchResult: null,
      });
      const noMatchCapability = new SkillCapability();
      noMatchCapability.initialize(noMatchContext);

      await noMatchCapability.match('random input');

      expect(noMatchContext.hookRegistry.emit).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // matchSync() 测试
  // ============================================

  describe('matchSync()', () => {
    it('should match skill synchronously', () => {
      const result = capability.matchSync('请帮我 review 代码');

      expect(result).not.toBeNull();
      expect(result?.skill.metadata.name).toBe('Code Review');
    });

    it('should return null when no match', () => {
      const noMatchContext = createMockAgentContext({
        skills: [codeReviewSkill],
        skillMatchResult: null,
      });
      const noMatchCapability = new SkillCapability();
      noMatchCapability.initialize(noMatchContext);

      const result = noMatchCapability.matchSync('random input');
      expect(result).toBeNull();
    });

    it('should not trigger hooks', () => {
      capability.matchSync('请帮我 review 代码');

      // matchSync 不应该触发 hooks
      expect(context.hookRegistry.emit).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // register() 测试
  // ============================================

  describe('register()', () => {
    it('should register new skill', () => {
      const newSkill = createTestSkill({
        metadata: {
          name: 'New Skill',
          description: 'A new skill',
          version: '1.0.0',
          tags: ['new'],
        },
        body: '# New Skill\n\nContent here.',
      });

      capability.register(newSkill);

      expect(context.skillRegistry.register).toHaveBeenCalledWith(newSkill);
    });
  });

  // ============================================
  // generateInstruction() 测试
  // ============================================

  describe('generateInstruction()', () => {
    it('should generate skill instruction', () => {
      const instruction = capability.generateInstruction(codeReviewSkill);

      expect(instruction).toContain('## Active Skill: Code Review');
      expect(instruction).toContain('**Description**:');
      expect(instruction).toContain('Used when user asks to review code quality');
    });

    it('should include skill body', () => {
      const instruction = capability.generateInstruction(codeReviewSkill);

      expect(instruction).toContain('### Instructions');
      expect(instruction).toContain('Review code for quality and best practices');
    });

    it('should include skill version', () => {
      const instruction = capability.generateInstruction(codeReviewSkill);

      expect(instruction).toContain('**Version**: 1.0.0');
    });
  });

  // ============================================
  // generateListDescription() 测试
  // ============================================

  describe('generateListDescription()', () => {
    it('should generate skill list description', () => {
      const description = capability.generateListDescription();

      expect(description).toContain('## Available Skills');
      expect(description).toContain('Code Review');
      expect(description).toContain('Test Generator');
    });

    it('should return empty string when no skills', () => {
      const emptyContext = createMockAgentContext({ skills: [] });
      const emptyCapability = new SkillCapability();
      emptyCapability.initialize(emptyContext);

      expect(emptyCapability.generateListDescription()).toBe('');
    });
  });

  // ============================================
  // size 属性测试
  // ============================================

  describe('size', () => {
    it('should return skill count', () => {
      expect(capability.size).toBe(2);
    });

    it('should return 0 when no skills', () => {
      const emptyContext = createMockAgentContext({ skills: [] });
      const emptyCapability = new SkillCapability();
      emptyCapability.initialize(emptyContext);

      expect(emptyCapability.size).toBe(0);
    });
  });

  // ============================================
  // 集成测试
  // ============================================

  describe('集成', () => {
    it('should work with AgentContext', () => {
      // 验证 capability 正确使用了 context
      capability.listAll();
      expect(context.skillRegistry.getAll).toHaveBeenCalled();

      capability.get('Code Review');
      expect(context.skillRegistry.get).toHaveBeenCalledWith('Code Review');
    });
  });
});
