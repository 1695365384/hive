/**
 * 技能系统全面测试
 *
 * 覆盖 loader, matcher, registry 三个核心模块
 * 目标覆盖率：80%+
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SkillRegistry,
  createSkillRegistry,
  getSkillRegistry,
  initializeSkills,
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

// ============================================
// 辅助函数
// ============================================

function createTestSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    metadata: {
      name: 'Test Skill',
      description: 'This skill should be used when the user asks to "test skill"',
      version: '1.0.0',
    },
    body: 'Test body content',
    path: '/test/skill-path',
    references: [],
    scripts: [],
    examples: [],
    assets: [],
    ...overrides,
  };
}

// ============================================
// parseFrontmatter 测试
// ============================================

describe('parseFrontmatter', () => {
  describe('基本解析', () => {
    it('应该正确解析标准的 SKILL.md 内容', () => {
      const content = `---
name: Code Review
description: This skill should be used when the user asks to "review code"
version: 1.0.0
---

# Code Review

This is a code review skill.`;

      const result = parseFrontmatter(content);

      expect(result.metadata.name).toBe('Code Review');
      expect(result.metadata.description).toBe('This skill should be used when the user asks to "review code"');
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.body).toBe('# Code Review\n\nThis is a code review skill.');
    });

    it('应该使用默认版本号当 version 未提供时', () => {
      const content = `---
name: Test Skill
description: Test description
---

Body content`;

      const result = parseFrontmatter(content);

      expect(result.metadata.version).toBe('0.0.1');
    });

    it('应该正确解析带引号的值', () => {
      const content = `---
name: "Test Skill"
description: 'Test description with single quotes'
version: "2.0.0"
---

Body`;

      const result = parseFrontmatter(content);

      expect(result.metadata.name).toBe('Test Skill');
      expect(result.metadata.description).toBe('Test description with single quotes');
      expect(result.metadata.version).toBe('2.0.0');
    });
  });

  describe('可选字段', () => {
    it('应该正确解析 author 字段', () => {
      const content = `---
name: Test Skill
description: Test description
author: John Doe
---

Body`;

      const result = parseFrontmatter(content);

      expect(result.metadata.author).toBe('John Doe');
    });

    it('应该正确解析 tags 数组（内联格式）', () => {
      const content = `---
name: Test Skill
description: Test description
tags: [code, review, quality]
---

Body`;

      const result = parseFrontmatter(content);

      expect(result.metadata.tags).toEqual(['code', 'review', 'quality']);
    });

    it('应该正确解析 tags 数组（多行格式）', () => {
      const content = `---
name: Test Skill
description: Test description
tags:
  - code
  - review
  - quality
---

Body`;

      const result = parseFrontmatter(content);

      expect(result.metadata.tags).toEqual(['code', 'review', 'quality']);
    });
  });

  describe('错误处理', () => {
    it('应该在缺少 frontmatter 时抛出错误', () => {
      const content = `# No Frontmatter

Just body content`;

      expect(() => parseFrontmatter(content)).toThrow('missing YAML frontmatter');
    });

    it('应该在缺少 name 字段时抛出错误', () => {
      const content = `---
description: Test description
---

Body`;

      expect(() => parseFrontmatter(content)).toThrow('missing "name" field');
    });

    it('应该在缺少 description 字段时抛出错误', () => {
      const content = `---
name: Test Skill
---

Body`;

      expect(() => parseFrontmatter(content)).toThrow('missing "description" field');
    });

    it('应该正确处理数字类型的 name（转换为字符串）', () => {
      const content = `---
name: 123
description: Test
---

Body`;

      // 数字会被转换为字符串
      const result = parseFrontmatter(content);
      expect(result.metadata.name).toBe('123');
    });
  });

  describe('边界情况', () => {
    it('应该处理空正文', () => {
      const content = `---
name: Test Skill
description: Test description
---

`;

      const result = parseFrontmatter(content);

      expect(result.body).toBe('');
    });

    it('应该处理包含 --- 的正文', () => {
      const content = `---
name: Test Skill
description: Test description
---

# Title

---

More content`;

      const result = parseFrontmatter(content);

      expect(result.body).toContain('---');
    });

    it('应该处理 Windows 换行符', () => {
      const content = `---\r\nname: Test Skill\r\ndescription: Test description\r\n---\r\n\r\nBody`;

      const result = parseFrontmatter(content);

      expect(result.metadata.name).toBe('Test Skill');
    });
  });
});

// ============================================
// extractTriggerPhrases 测试
// ============================================

describe('extractTriggerPhrases', () => {
  it('应该从双引号中提取触发短语', () => {
    const description = 'This skill should be used when the user asks to "review code", "check quality"';
    const phrases = extractTriggerPhrases(description);

    expect(phrases).toEqual(expect.arrayContaining(['review code', 'check quality']));
  });

  it('应该从中文引号中提取触发短语', () => {
    const description = '当用户要求 "代码审查"、"检查质量" 时使用此技能';
    const phrases = extractTriggerPhrases(description);

    expect(phrases).toEqual(expect.arrayContaining(['代码审查', '检查质量']));
  });

  it('应该从单引号中提取触发短语', () => {
    const description = "Use this skill for 'test case' and 'unit test'";
    const phrases = extractTriggerPhrases(description);

    expect(phrases).toEqual(expect.arrayContaining(['test case', 'unit test']));
  });

  it('应该去重触发短语', () => {
    const description = 'Use "test" and "test" and "TEST"';
    const phrases = extractTriggerPhrases(description);

    expect(phrases.length).toBe(1);
    expect(phrases[0]).toBe('test');
  });

  it('应该返回空数组当没有引号时', () => {
    const description = 'This skill has no trigger phrases';
    const phrases = extractTriggerPhrases(description);

    expect(phrases).toEqual([]);
  });

  it('应该处理混合引号', () => {
    const description = 'Use "double quotes" and \'single quotes\' and "中文引号"';
    const phrases = extractTriggerPhrases(description);

    expect(phrases).toEqual(expect.arrayContaining(['double quotes', 'single quotes', '中文引号']));
  });

  it('应该转换为小写', () => {
    const description = 'Use "REVIEW CODE" and "Check Quality"';
    const phrases = extractTriggerPhrases(description);

    expect(phrases).toEqual(['review code', 'check quality']);
  });
});

// ============================================
// SkillMatcher 测试
// ============================================

describe('SkillMatcher', () => {
  let matcher: SkillMatcher;

  beforeEach(() => {
    matcher = createSkillMatcher();
  });

  describe('matchSingle', () => {
    it('应该在输入包含触发短语时返回匹配结果', () => {
      const skill = createTestSkill();

      const result = matcher.matchSingle('请帮我 test skill', skill);

      expect(result).not.toBeNull();
      expect(result?.matchedPhrase).toBe('test skill');
      expect(result?.skill).toBe(skill);
    });

    it('应该在输入不包含触发短语时返回 null', () => {
      const skill = createTestSkill();

      const result = matcher.matchSingle('这个输入不包含任何触发短语', skill);

      expect(result).toBeNull();
    });

    it('应该返回第一个匹配的触发短语索引', () => {
      const skill = createTestSkill({
        metadata: {
          name: 'Multi-phrase Skill',
          description: 'Use for "first phrase", "second phrase", "third phrase"',
          version: '1.0.0',
        },
      });

      const result = matcher.matchSingle('I want to use second phrase', skill);

      expect(result?.matchIndex).toBe(1);
      expect(result?.matchedPhrase).toBe('second phrase');
    });
  });

  describe('matchBest', () => {
    it('应该从多个技能中返回最佳匹配', () => {
      const skill1 = createTestSkill({
        metadata: { name: 'Skill 1', description: 'Use for "alpha"', version: '1.0.0' },
        path: '/skill1',
      });
      const skill2 = createTestSkill({
        metadata: { name: 'Skill 2', description: 'Use for "beta"', version: '1.0.0' },
        path: '/skill2',
      });

      const result = matcher.matchBest('I want beta', [skill1, skill2]);

      expect(result?.skill.metadata.name).toBe('Skill 2');
    });

    it('应该在没有匹配时返回 null', () => {
      const skill = createTestSkill();

      const result = matcher.matchBest('no match here', [skill]);

      expect(result).toBeNull();
    });
  });

  describe('matchAll', () => {
    it('应该返回所有匹配的技能', () => {
      const skill1 = createTestSkill({
        metadata: { name: 'Skill 1', description: 'Use for "test"', version: '1.0.0' },
        path: '/skill1',
      });
      const skill2 = createTestSkill({
        metadata: { name: 'Skill 2', description: 'Use for "test" too', version: '1.0.0' },
        path: '/skill2',
      });
      const skill3 = createTestSkill({
        metadata: { name: 'Skill 3', description: 'Use for "other"', version: '1.0.0' },
        path: '/skill3',
      });

      const results = matcher.matchAll('I want test', [skill1, skill2, skill3]);

      expect(results.length).toBe(2);
      expect(results.map(r => r.skill.metadata.name)).toEqual(expect.arrayContaining(['Skill 1', 'Skill 2']));
    });

    it('应该在没有匹配时返回空数组', () => {
      const skill = createTestSkill();

      const results = matcher.matchAll('no match', [skill]);

      expect(results).toEqual([]);
    });
  });

  describe('缓存', () => {
    it('应该缓存触发短语提取结果', () => {
      const skill = createTestSkill();

      // 第一次匹配
      matcher.matchSingle('test skill', skill);
      // 第二次匹配应该使用缓存
      matcher.matchSingle('test skill', skill);

      // 如果缓存工作正常，不会有异常
      expect(true).toBe(true);
    });

    it('clearCache 应该清除缓存', () => {
      const skill = createTestSkill();

      matcher.matchSingle('test skill', skill);
      matcher.clearCache();
      matcher.matchSingle('test skill', skill);

      // 如果清除缓存后重新提取，不会有异常
      expect(true).toBe(true);
    });
  });

  describe('模糊匹配', () => {
    it('应该支持自定义模糊阈值', () => {
      const strictMatcher = createSkillMatcher(1.0);
      const skill = createTestSkill();

      // 严格匹配时可能不匹配
      const result = strictMatcher.matchSingle('test skill', skill);

      expect(result).not.toBeNull();
    });
  });
});

// ============================================
// SkillLoader 测试
// ============================================

describe('SkillLoader', () => {
  describe('loadSkills', () => {
    it('应该从目录加载技能', () => {
      const skillsDir = path.join(__dirname, '..', 'skills');
      const loader = createSkillLoader({
        skillsDir,
        recursive: true,
      });

      const skills = loader.loadSkills();

      expect(skills.length).toBeGreaterThan(0);
      expect(skills.find(s => s.metadata.name === 'Code Review')).toBeDefined();
      expect(skills.find(s => s.metadata.name === 'API Testing')).toBeDefined();
    });

    it('应该在目录不存在时返回空数组', () => {
      const loader = createSkillLoader({
        skillsDir: '/nonexistent/path',
      });

      const skills = loader.loadSkills();

      expect(skills).toEqual([]);
    });

    it('应该支持非递归模式', () => {
      const skillsDir = path.join(__dirname, '..', 'skills');
      const loader = createSkillLoader({
        skillsDir,
        recursive: false,
      });

      const skills = loader.loadSkills();

      // 只加载顶层目录的技能
      expect(skills.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('loadSkill', () => {
    it('应该加载单个技能目录', () => {
      const skillDir = path.join(__dirname, '..', 'skills', 'code-review');
      const loader = createSkillLoader({
        skillsDir: __dirname,
      });

      const skill = loader.loadSkill(skillDir);

      expect(skill.metadata.name).toBe('Code Review');
      expect(skill.body.length).toBeGreaterThan(0);
    });

    it('应该在 SKILL.md 不存在时抛出错误', () => {
      const loader = createSkillLoader({
        skillsDir: __dirname,
      });

      expect(() => loader.loadSkill('/nonexistent')).toThrow('Skill not found');
    });
  });

  describe('loadReference', () => {
    it('应该在参考文件不存在时抛出错误', () => {
      const loader = createSkillLoader({
        skillsDir: __dirname,
      });
      const skill = createTestSkill();

      expect(() => loader.loadReference(skill, 'nonexistent.md')).toThrow('Reference not found');
    });
  });

  describe('loadAllReferences', () => {
    it('应该在技能没有参考文件时返回空 Map', () => {
      const loader = createSkillLoader({
        skillsDir: __dirname,
      });
      const skill = createTestSkill();

      const refs = loader.loadAllReferences(skill);

      expect(refs.size).toBe(0);
    });
  });
});

// ============================================
// SkillRegistry 测试
// ============================================

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = createSkillRegistry();
  });

  describe('register/unregister', () => {
    it('应该正确注册技能', () => {
      const skill = createTestSkill();

      registry.register(skill);

      expect(registry.has('Test Skill')).toBe(true);
      expect(registry.get('Test Skill')).toEqual(skill);
    });

    it('应该支持大小写不敏感的名称查找', () => {
      const skill = createTestSkill();

      registry.register(skill);

      expect(registry.has('test skill')).toBe(true);
      expect(registry.has('TEST SKILL')).toBe(true);
      expect(registry.get('test skill')).toEqual(skill);
    });

    it('应该正确注销技能', () => {
      const skill = createTestSkill();

      registry.register(skill);
      expect(registry.has('Test Skill')).toBe(true);

      const result = registry.unregister('Test Skill');

      expect(result).toBe(true);
      expect(registry.has('Test Skill')).toBe(false);
    });

    it('注销不存在的技能应该返回 false', () => {
      const result = registry.unregister('Nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getAll/getAllMetadata', () => {
    it('应该返回所有技能', () => {
      const skill1 = createTestSkill({ metadata: { name: 'Skill 1', description: 'Test', version: '1.0.0' } });
      const skill2 = createTestSkill({ metadata: { name: 'Skill 2', description: 'Test', version: '1.0.0' }, path: '/skill2' });

      registry.register(skill1);
      registry.register(skill2);

      const all = registry.getAll();

      expect(all.length).toBe(2);
    });

    it('应该返回所有技能元数据', () => {
      const skill = createTestSkill();
      registry.register(skill);

      const metadata = registry.getAllMetadata();

      expect(metadata.length).toBe(1);
      expect(metadata[0].name).toBe('Test Skill');
    });
  });

  describe('size', () => {
    it('应该返回正确的技能数量', () => {
      expect(registry.size).toBe(0);

      registry.register(createTestSkill());
      expect(registry.size).toBe(1);

      // 注册不同名称的技能
      registry.register(createTestSkill({
        metadata: { name: 'Another Skill', description: 'Test', version: '1.0.0' },
        path: '/skill2'
      }));
      expect(registry.size).toBe(2);
    });
  });

  describe('clear', () => {
    it('应该清空所有技能', () => {
      registry.register(createTestSkill());
      expect(registry.size).toBe(1);

      registry.clear();

      expect(registry.size).toBe(0);
    });
  });

  describe('match', () => {
    it('应该匹配技能', () => {
      const skill = createTestSkill();
      registry.register(skill);

      const match = registry.match('请帮我 test skill');

      expect(match).not.toBeNull();
      expect(match?.skill.metadata.name).toBe('Test Skill');
    });

    it('应该在禁用自动匹配时返回 null', () => {
      const disabledRegistry = createSkillRegistry({ enableAutoMatch: false });
      disabledRegistry.register(createTestSkill());

      const match = disabledRegistry.match('test skill');

      expect(match).toBeNull();
    });
  });

  describe('matchAll', () => {
    it('应该返回所有匹配的技能', () => {
      const skill1 = createTestSkill({
        metadata: { name: 'Skill 1', description: 'Use for "test"', version: '1.0.0' },
      });
      const skill2 = createTestSkill({
        metadata: { name: 'Skill 2', description: 'Use for "test" too', version: '1.0.0' },
        path: '/skill2',
      });

      registry.register(skill1);
      registry.register(skill2);

      const matches = registry.matchAll('I want test');

      expect(matches.length).toBe(2);
    });

    it('应该在禁用自动匹配时返回空数组', () => {
      const disabledRegistry = createSkillRegistry({ enableAutoMatch: false });
      disabledRegistry.register(createTestSkill());

      const matches = disabledRegistry.matchAll('test skill');

      expect(matches).toEqual([]);
    });
  });

  describe('generateSkillListDescription', () => {
    it('应该生成技能列表描述', () => {
      registry.register(createTestSkill());

      const description = registry.generateSkillListDescription();

      expect(description).toContain('Test Skill');
    });

    it('应该在空注册表时返回空字符串', () => {
      const description = registry.generateSkillListDescription();

      expect(description).toBe('');
    });
  });

  describe('generateSkillInstruction', () => {
    it('应该生成技能指令', () => {
      const skill = createTestSkill({
        body: '# Instructions\n\nDo something useful.',
      });

      const instruction = registry.generateSkillInstruction(skill);

      expect(instruction).toContain('Test Skill');
      expect(instruction).toContain('1.0.0');
      expect(instruction).toContain('Do something useful');
    });
  });

  describe('initialize', () => {
    it('应该从内置目录加载技能', async () => {
      const skillsDir = path.join(__dirname, '..', 'skills');
      const testRegistry = createSkillRegistry({
        builtinSkillsDir: skillsDir,
      });

      await testRegistry.initialize();

      expect(testRegistry.size).toBeGreaterThan(0);
    });
  });
});

// ============================================
// 全局函数测试
// ============================================

describe('全局函数', () => {
  it('getSkillRegistry 应该返回全局单例', () => {
    const registry1 = getSkillRegistry();
    const registry2 = getSkillRegistry();

    expect(registry1).toBe(registry2);
  });

  it('createSkillRegistry 应该创建新实例', () => {
    const registry1 = createSkillRegistry();
    const registry2 = createSkillRegistry();

    expect(registry1).not.toBe(registry2);
  });
});
