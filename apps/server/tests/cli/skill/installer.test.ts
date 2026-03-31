/**
 * Skill Installer 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseSource,
  discoverSkills,
  installSkills,
  cleanup,
  validateCloneUrl,
  type DiscoveredSkill,
} from '../../../src/cli/commands/skill/installer.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

// ============================================
// parseSource 测试
// ============================================

describe('parseSource', () => {
  it('应该解析 owner/repo 简写', () => {
    const result = parseSource('vercel-labs/agent-skills');
    expect(result.url).toBe('https://github.com/vercel-labs/agent-skills');
    expect(result.repoName).toBe('agent-skills');
  });

  it('应该解析完整 GitHub HTTPS URL', () => {
    const result = parseSource('https://github.com/owner/repo');
    expect(result.url).toBe('https://github.com/owner/repo');
    expect(result.repoName).toBe('repo');
  });

  it('应该解析带 .git 后缀的 URL', () => {
    const result = parseSource('https://github.com/owner/repo.git');
    expect(result.repoName).toBe('repo');
  });

  it('应该解析 SSH git URL', () => {
    const result = parseSource('git@github.com:owner/repo.git');
    expect(result.url).toBe('git@github.com:owner/repo.git');
    expect(result.repoName).toBe('repo');
  });

  it('应该解析带路径的 URL（子目录安装）', () => {
    const result = parseSource('https://github.com/owner/repo/tree/main/skills/web-design');
    expect(result.url).toBe('https://github.com/owner/repo/tree/main/skills/web-design');
  });
});

// ============================================
// validateCloneUrl 测试
// ============================================

describe('validateCloneUrl', () => {
  it('应该接受合法 GitHub URL', () => {
    expect(() => validateCloneUrl('https://github.com/owner/repo')).not.toThrow();
    expect(() => validateCloneUrl('https://github.com/owner/repo.git')).not.toThrow();
    expect(() => validateCloneUrl('git@github.com:owner/repo.git')).not.toThrow();
  });

  it('应该拒绝含空格的 URL', () => {
    expect(() => validateCloneUrl('https://github.com/owner/repo --upload-pack=evil'))
      .toThrow('whitespace');
  });

  it('应该拒绝含 -- 选项注入的 URL', () => {
    expect(() => validateCloneUrl('--upload-pack=touch'))
      .toThrow('option flags');
  });

  it('应该拒绝含 shell 特殊字符的 URL', () => {
    expect(() => validateCloneUrl("https://github.com/owner/repo';rm"))
      .toThrow('special characters');
    expect(() => validateCloneUrl('https://github.com/owner/repo&&whoami'))
      .toThrow('special characters');
    expect(() => validateCloneUrl('https://github.com/owner/repo`id`'))
      .toThrow('special characters');
  });
});

// ============================================
// discoverSkills 测试
// ============================================

describe('discoverSkills', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(tmpdir(), 'hive-discover-'));
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it('应该从 skills/ 目录发现技能', () => {
    createSkillFixture(tempDir, 'skills', 'my-skill');
    const result = discoverSkills(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('my-skill');
  });

  it('应该发现多个技能', () => {
    createSkillFixture(tempDir, 'skills', 'skill-a');
    createSkillFixture(tempDir, 'skills', 'skill-b');
    const result = discoverSkills(tempDir);
    expect(result).toHaveLength(2);
  });

  it('应该从 .claude/skills/ 目录发现技能', () => {
    createSkillFixture(tempDir, '.claude/skills', 'claude-skill');
    const result = discoverSkills(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('claude-skill');
  });

  it('应该优先 skills/ 而非 .claude/skills/（同名时）', () => {
    createSkillFixture(tempDir, 'skills', 'dupe');
    createSkillFixture(tempDir, '.claude/skills', 'dupe');
    const result = discoverSkills(tempDir);
    expect(result).toHaveLength(1);
    // skills/ 优先，sourceDir 应指向 skills/dupe
    expect(result[0].sourceDir).toContain(path.join('skills', 'dupe'));
  });

  it('应该发现根目录 SKILL.md（单技能仓库）', () => {
    fs.writeFileSync(
      path.join(tempDir, 'SKILL.md'),
      '---\nname: root-skill\ndescription: test\n---\n\n# Root Skill',
      'utf-8'
    );
    const result = discoverSkills(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('root-skill');
  });

  it('应该在无技能时返回空数组', () => {
    const result = discoverSkills(tempDir);
    expect(result).toEqual([]);
  });

  it('应该在标准路径未找到时递归兜底', () => {
    // 非标准路径
    createSkillFixture(tempDir, 'non-standard-dir', 'deep-skill');
    const result = discoverSkills(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('deep-skill');
  });
});

// ============================================
// installSkills 测试
// ============================================

describe('installSkills', () => {
  let tempDir: string;
  let targetDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(tmpdir(), 'hive-install-'));
    targetDir = path.join(tempDir, 'skills.local');
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it('应该安装技能到目标目录', () => {
    const sourceDir = path.join(tempDir, 'source');
    createSkillFixture(tempDir, 'source', 'my-skill');

    const skills: DiscoveredSkill[] = [
      { name: 'my-skill', sourceDir: path.join(sourceDir, 'my-skill'), skillMdPath: path.join(sourceDir, 'my-skill', 'SKILL.md') },
    ];

    const result = installSkills(skills, targetDir);
    expect(result.installed).toEqual(['my-skill']);
    expect(fs.existsSync(path.join(targetDir, 'my-skill', 'SKILL.md'))).toBe(true);
  });

  it('应该覆盖已存在的同名技能', () => {
    const sourceDir = path.join(tempDir, 'source');
    createSkillFixture(tempDir, 'source', 'my-skill');

    // 预先安装旧版本
    fs.mkdirSync(path.join(targetDir, 'my-skill'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'my-skill', 'SKILL.md'), 'old content');

    const skills: DiscoveredSkill[] = [
      { name: 'my-skill', sourceDir: path.join(sourceDir, 'my-skill'), skillMdPath: path.join(sourceDir, 'my-skill', 'SKILL.md') },
    ];

    const result = installSkills(skills, targetDir);
    expect(result.updated).toEqual(['my-skill']);
    expect(result.installed).toEqual([]);
  });

  it('应该按 filter 过滤安装', () => {
    const sourceDir = path.join(tempDir, 'source');
    createSkillFixture(tempDir, 'source', 'skill-a');
    createSkillFixture(tempDir, 'source', 'skill-b');

    const skills: DiscoveredSkill[] = [
      { name: 'skill-a', sourceDir: path.join(sourceDir, 'skill-a'), skillMdPath: '' },
      { name: 'skill-b', sourceDir: path.join(sourceDir, 'skill-b'), skillMdPath: '' },
    ];

    const result = installSkills(skills, targetDir, { filter: ['skill-a'] });
    expect(result.installed).toEqual(['skill-a']);
    expect(fs.existsSync(path.join(targetDir, 'skill-b'))).toBe(false);
  });

  it('应该跳过路径穿越的技能', () => {
    const skills: DiscoveredSkill[] = [
      { name: '../etc/passwd', sourceDir: tempDir, skillMdPath: '' },
    ];

    const result = installSkills(skills, targetDir);
    expect(result.skipped).toEqual(['../etc/passwd']);
  });

  it('空技能列表应返回空结果', () => {
    const result = installSkills([], targetDir);
    expect(result.installed).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});

// ============================================
// cleanup 测试
// ============================================

describe('cleanup', () => {
  it('应该删除目录及其内容', () => {
    const dir = fs.mkdtempSync(path.join(tmpdir(), 'hive-cleanup-'));
    fs.writeFileSync(path.join(dir, 'test.txt'), 'content');
    fs.mkdirSync(path.join(dir, 'subdir'));

    cleanup(dir);

    expect(fs.existsSync(dir)).toBe(false);
  });

  it('应该对不存在的目录静默处理', () => {
    expect(() => cleanup('/nonexistent/path/that/does/not/exist')).not.toThrow();
  });
});

// ============================================
// Helpers
// ============================================

function createSkillFixture(baseDir: string, parentDir: string, skillName: string): void {
  const skillDir = path.join(baseDir, parentDir, skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: ${skillName}\ndescription: Test skill for "${skillName}"\n---\n\n# ${skillName}\n\nContent.`,
    'utf-8'
  );
}
