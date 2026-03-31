/**
 * Skill CLI 集成测试
 */

import { describe, it, expect, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

const CLI = 'node dist/cli/index.js';

describe('hive skill CLI', () => {
  let testDir: string;

  afterEach(() => {
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('应该显示 skill 帮助信息', () => {
    const output = execSync(`${CLI} skill --help`, { cwd: path.resolve('apps/server'), encoding: 'utf-8' });
    expect(output).toContain('add');
    expect(output).toContain('list');
    expect(output).toContain('remove');
  });

  it('应该在缺少 source 参数时报错', () => {
    try {
      execSync(`${CLI} skill add`, { cwd: path.resolve('apps/server'), encoding: 'utf-8' });
      expect.unreachable('Should have thrown');
    } catch (error) {
      const output = (error as { stderr?: string }).stderr ?? '';
      expect(output).toContain('error');
    }
  });

  it('应该在缺少 name 参数时报错', () => {
    try {
      execSync(`${CLI} skill remove`, { cwd: path.resolve('apps/server'), encoding: 'utf-8' });
      expect.unreachable('Should have thrown');
    } catch (error) {
      const output = (error as { stderr?: string }).stderr ?? '';
      expect(output).toContain('error');
    }
  });

  it('skill list 应该正常工作（无技能时）', () => {
    testDir = fs.mkdtempSync(path.join(tmpdir(), 'hive-cli-test-'));
    const output = execSync(`${CLI} skill list`, {
      cwd: path.resolve('apps/server'),
      encoding: 'utf-8',
      env: { ...process.env, HIVE_SKILLS_DIR: testDir },
    });
    expect(output).toContain('No skills');
  });

  it('应该拒绝移除不存在的技能', () => {
    try {
      execSync(`${CLI} skill remove nonexistent-skill-xyz`, {
        cwd: path.resolve('apps/server'),
        encoding: 'utf-8',
      });
      expect.unreachable('Should have thrown');
    } catch (error) {
      const output = (error as { stderr?: string }).stderr ?? '';
      expect(output).toContain('not found');
    }
  });

  it('应该拒绝移除内置技能', () => {
    testDir = fs.mkdtempSync(path.join(tmpdir(), 'hive-cli-test-'));
    // 创建一个假的内置技能
    const builtinSkillDir = path.join(testDir, 'test-builtin');
    fs.mkdirSync(builtinSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(builtinSkillDir, 'SKILL.md'),
      '---\nname: test-builtin\ndescription: test\n---\n\n# Test',
      'utf-8'
    );

    try {
      execSync(`${CLI} skill remove test-builtin`, {
        cwd: path.resolve('apps/server'),
        encoding: 'utf-8',
        env: { ...process.env, HIVE_SKILLS_DIR: testDir },
      });
      expect.unreachable('Should have thrown');
    } catch (error) {
      const output = (error as { stderr?: string }).stderr ?? '';
      expect(output).toContain('Cannot remove built-in');
    }
  });

  it('应该拒绝路径穿越的技能名', () => {
    try {
      execSync(`${CLI} skill remove ../../etc`, {
        cwd: path.resolve('apps/server'),
        encoding: 'utf-8',
      });
      expect.unreachable('Should have thrown');
    } catch (error) {
      const output = (error as { stderr?: string }).stderr ?? '';
      // 路径穿越或 not found 均为安全拒绝
      expect(output).toMatch(/Invalid skill name|not found/i);
    }
  });
});
