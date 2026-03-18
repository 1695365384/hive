/**
 * 技能系统测试
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  SkillRegistry,
  createSkillRegistry,
  SkillLoader,
  createSkillLoader,
  SkillMatcher,
  createSkillMatcher,
  extractTriggerPhrases,
  parseFrontmatter,
  type Skill,
} from '../src/skills/index.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 辅助函数：创建测试技能
function createTestSkill(name: string, description: string, body: string = 'Test body'): Skill {
  return {
    metadata: {
      name,
      description,
      version: '1.0.0',
    },
    body,
    path: '/test',
    references: [],
    scripts: [],
    examples: [],
    assets: [],
  };
}

describe('技能系统', () => {
  describe('parseFrontmatter', () => {
    it('应该正确解析有效的 SKILL.md', () => {
      const content = `---
name: Test Skill
description: This skill should be used when the user asks to "test skill"
version: 1.0.0
---

# Test Skill

This is a test skill.`;

      const result = parseFrontmatter(content);

      expect(result.metadata.name).toBe('Test Skill');
      expect(result.metadata.description).toBe('This skill should be used when the user asks to "test skill"');
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.body).toContain('# Test Skill');
    });

    it('应该在缺少必需字段时抛出错误', () => {
      const content = `---
name: Test Skill
---

# Test Skill`;

      expect(() => parseFrontmatter(content)).toThrow('missing "description" field');
    });
  });

  describe('extractTriggerPhrases', () => {
    it('应该从描述中提取双引号内的触发短语', () => {
      const description = 'This skill should be used when the user asks to "review code", "check quality"';
      const phrases = extractTriggerPhrases(description);

      expect(phrases).toContain('review code');
      expect(phrases).toContain('check quality');
    });

    it('应该从描述中提取中文引号内的触发短语', () => {
      const description = '当用户要求 "代码审查"、"检查质量" 时使用此技能';
      const phrases = extractTriggerPhrases(description);

      expect(phrases).toContain('代码审查');
      expect(phrases).toContain('检查质量');
    });

    it('应该去重触发短语', () => {
      const description = 'This skill is for "test" and "test"';
      const phrases = extractTriggerPhrases(description);

      expect(phrases.length).toBe(1);
      expect(phrases[0]).toBe('test');
    });
  });

  describe('SkillMatcher', () => {
    it('应该匹配用户输入中的触发短语', () => {
      const matcher = createSkillMatcher();
      const skill = createTestSkill('Test Skill', 'This skill should be used when the user asks to "review code"');

      const result = matcher.matchSingle('请帮我 review code', skill);

      expect(result).not.toBeNull();
      expect(result?.matchedPhrase).toBe('review code');
    });

    it('应该返回 null 当没有匹配时', () => {
      const matcher = createSkillMatcher();
      const skill = createTestSkill('Test Skill', 'This skill should be used when the user asks to "review code"');

      const result = matcher.matchSingle('这个输入不包含任何触发短语', skill);

      expect(result).toBeNull();
    });
  });

  describe('SkillRegistry', () => {
    it('应该正确注册和获取技能', () => {
      const registry = createSkillRegistry();
      const skill = createTestSkill('Test Skill', 'Test description');

      registry.register(skill);

      expect(registry.has('Test Skill')).toBe(true);
      expect(registry.get('Test Skill')).toEqual(skill);
    });

    it('应该正确注销技能', () => {
      const registry = createSkillRegistry();
      const skill = createTestSkill('Test Skill', 'Test description');

      registry.register(skill);
      expect(registry.has('Test Skill')).toBe(true);

      registry.unregister('Test Skill');
      expect(registry.has('Test Skill')).toBe(false);
    });

    it('应该正确匹配技能', () => {
      const registry = createSkillRegistry();
      const skill = createTestSkill('Code Review', 'This skill should be used when the user asks to "review code", "代码审查"');

      registry.register(skill);

      const match = registry.match('请帮我 review code');
      expect(match).not.toBeNull();
      expect(match?.skill.metadata.name).toBe('Code Review');
    });
  });

  describe('SkillLoader', () => {
    it('应该从目录加载技能', async () => {
      const skillsDir = path.join(__dirname, '..', 'skills');
      const loader = createSkillLoader({
        skillsDir,
        recursive: true,
      });

      const skills = loader.loadSkills();

      // 检查是否加载了内置技能
      expect(skills.length).toBeGreaterThan(0);

      // 检查 code-review 技能
      const codeReviewSkill = skills.find((s) => s.metadata.name === 'Code Review');
      expect(codeReviewSkill).toBeDefined();
      expect(codeReviewSkill?.metadata.description).toContain('review code');

      // 检查 api-testing 技能
      const apiTestingSkill = skills.find((s) => s.metadata.name === 'API Testing');
      expect(apiTestingSkill).toBeDefined();
      expect(apiTestingSkill?.metadata.description).toContain('test API');
    });
  });
});
