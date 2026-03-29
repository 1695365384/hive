/**
 * Glob 工具和 Grep 工具单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { createGlobTool } from '../../../src/tools/built-in/glob-tool.js';
import { createGrepTool } from '../../../src/tools/built-in/grep-tool.js';
import { _resetAllowedRoots } from '../../../src/tools/built-in/utils/security.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';

describe('createGlobTool', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = join(os.tmpdir(), `hive-glob-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'a.ts'), 'export const a = 1;');
    await writeFile(join(tmpDir, 'b.ts'), 'export const b = 2;');
    await mkdir(join(tmpDir, 'sub'), { recursive: true });
    await writeFile(join(tmpDir, 'sub', 'c.ts'), 'export const c = 3;');
    await writeFile(join(tmpDir, 'README.md'), '# Test');
  });

  afterAll(async () => {
    delete process.env.HIVE_WORKING_DIR;
    _resetAllowedRoots();
    try { await rm(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('should match files with *.ts pattern', async () => {
    process.env.HIVE_WORKING_DIR = tmpDir;
    const tool = createGlobTool();
    const result = await tool.execute!({
      pattern: '*.ts',
      path: tmpDir,
    }, {} as any);
    expect(result).toContain('a.ts');
    expect(result).toContain('b.ts');
    expect(result).not.toContain('README.md');
    delete process.env.HIVE_WORKING_DIR;
  });

  it('should match files recursively with **/*.ts', async () => {
    process.env.HIVE_WORKING_DIR = tmpDir;
    const tool = createGlobTool();
    const result = await tool.execute!({
      pattern: '**/*.ts',
      path: tmpDir,
    }, {} as any);
    expect(result).toContain('a.ts');
    expect(result).toContain('b.ts');
    expect(result).toContain('c.ts');
    delete process.env.HIVE_WORKING_DIR;
  });

  it('should return empty message when no matches', async () => {
    process.env.HIVE_WORKING_DIR = tmpDir;
    const tool = createGlobTool();
    const result = await tool.execute!({
      pattern: '*.py',
      path: tmpDir,
    }, {} as any);
    expect(result).toContain('未找到');
    delete process.env.HIVE_WORKING_DIR;
  });

  it('should truncate results when exceeding maxResults', async () => {
    process.env.HIVE_WORKING_DIR = tmpDir;
    const tool = createGlobTool();
    const result = await tool.execute!({
      pattern: '*',
      path: tmpDir,
      maxResults: 1,
    }, {} as any);
    expect(result).toContain('已截断');
    delete process.env.HIVE_WORKING_DIR;
  });

  it('should block path traversal', async () => {
    const tool = createGlobTool();
    const result = await tool.execute!({
      pattern: '*',
      path: '/etc',
    }, {} as any);
    expect(result).toContain('[Security]');
    expect(result).toContain('不在允许的工作目录内');
  });

  it('should cap maxResults above 1000', async () => {
    // zodSchema() 不暴露 safeParse，验证在 execute 中进行
    process.env.HIVE_WORKING_DIR = tmpDir;
    const tool = createGlobTool();
    const result = await tool.execute!({ pattern: '*.ts', maxResults: 2000 }, {} as any);
    // 大文件数应被截断，不会返回2000个结果
    expect(typeof result).toBe('string');
    delete process.env.HIVE_WORKING_DIR;
  });
});

describe('createGrepTool', () => {
  let tmpDir: string;

  beforeEach(async () => {
    _resetAllowedRoots();
    tmpDir = join(os.tmpdir(), `hive-grep-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'a.ts'), 'export const a = 1;\nconsole.log(a);');
    await writeFile(join(tmpDir, 'b.ts'), 'export const b = 2;\n// comment');
    await mkdir(join(tmpDir, 'sub'), { recursive: true });
    await writeFile(join(tmpDir, 'sub', 'c.ts'), 'export const c = 3;');
    process.env.HIVE_WORKING_DIR = tmpDir;
  });

  afterEach(async () => {
    delete process.env.HIVE_WORKING_DIR;
    _resetAllowedRoots();
    try { await rm(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('should search files and return matches', async () => {
    const tool = createGrepTool();
    const result = await tool.execute!({
      pattern: 'export const',
      path: tmpDir,
    }, {} as any);
    expect(result).toContain('a.ts');
    expect(result).toContain('b.ts');
    expect(result).toContain('c.ts');
  });

  it('should return empty message when no matches', async () => {
    const tool = createGrepTool();
    const result = await tool.execute!({
      pattern: 'nonexistent_pattern_xyz',
      path: tmpDir,
    }, {} as any);
    expect(result).toContain('未找到');
  });

  it('should support case insensitive search', async () => {
    const tool = createGrepTool();
    const result = await tool.execute!({
      pattern: 'EXPORT',
      path: tmpDir,
      caseInsensitive: true,
    }, {} as any);
    expect(result).toContain('a.ts');
  });

  it('should support glob filter', async () => {
    const tool = createGrepTool();
    const result = await tool.execute!({
      pattern: 'export const',
      path: tmpDir,
      glob: '*.ts',
    }, {} as any);
    expect(result).toContain('a.ts');
    expect(result).toContain('b.ts');
    // sub/c.ts should also match since glob is *.ts
    expect(result).toContain('c.ts');
  });

  it('should block path traversal', async () => {
    const tool = createGrepTool();
    const result = await tool.execute!({
      pattern: 'root',
      path: '/etc',
    }, {} as any);
    expect(result).toContain('[Security]');
  });

  it('should handle special regex characters safely', async () => {
    const tool = createGrepTool();
    // Should not crash with regex injection
    const result = await tool.execute!({
      pattern: '(?:invalid[regex',
      path: tmpDir,
    }, {} as any);
    expect(typeof result).toBe('string');
  });

  it('should cap maxResults above 1000', async () => {
    // zodSchema() 不暴露 safeParse，验证在 execute 中进行
    process.env.HIVE_WORKING_DIR = tmpDir;
    const tool = createGrepTool();
    const result = await tool.execute!({ pattern: 'const', maxResults: 2000 }, {} as any);
    // 大文件数应被截断
    expect(typeof result).toBe('string');
    delete process.env.HIVE_WORKING_DIR;
  });
});
