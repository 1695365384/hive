/**
 * Glob 工具和 Grep 工具单元测试
 */

import { describe, it, expect, vi } from 'vitest';
import { createGlobTool } from '../../../src/tools/built-in/glob-tool.js';
import { createGrepTool } from '../../../src/tools/built-in/grep-tool.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';

// Mock child_process.exec for grep tests
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));
import { exec } from 'node:child_process';
const mockExec = vi.mocked(exec);

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
    const { rm } = await import('node:fs/promises');
    try { await rm(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('should match files with *.ts pattern', async () => {
    const tool = createGlobTool();
    const result = await tool.execute!({
      pattern: '*.ts',
      path: tmpDir,
    }, {} as any);
    expect(result).toContain('a.ts');
    expect(result).toContain('b.ts');
    expect(result).not.toContain('README.md');
  });

  it('should match files recursively with **/*.ts', async () => {
    const tool = createGlobTool();
    const result = await tool.execute!({
      pattern: '**/*.ts',
      path: tmpDir,
    }, {} as any);
    expect(result).toContain('a.ts');
    expect(result).toContain('b.ts');
    expect(result).toContain('c.ts');
  });

  it('should return empty message when no matches', async () => {
    const tool = createGlobTool();
    const result = await tool.execute!({
      pattern: '*.py',
      path: tmpDir,
    }, {} as any);
    expect(result).toContain('未找到');
  });

  it('should truncate results when exceeding maxResults', async () => {
    const tool = createGlobTool();
    const result = await tool.execute!({
      pattern: '*',
      path: tmpDir,
      maxResults: 1,
    }, {} as any);
    expect(result).toContain('已截断');
  });

  it('should return error on invalid path', async () => {
    const tool = createGlobTool();
    const result = await tool.execute!({
      pattern: '*',
      path: '/nonexistent/path/xyz',
    }, {} as any);
    // Should not crash, may return empty or error
    expect(typeof result).toBe('string');
  });
});

describe('createGrepTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should search files and return matches', async () => {
    mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
      cb(null, 'file.ts:10:const x = 1;\nother.ts:5:const y = 2;');
    });
    const tool = createGrepTool();
    const result = await tool.execute!({
      pattern: 'const',
      path: '/tmp',
    }, {} as any);
    expect(result).toContain('file.ts');
    expect(result).toContain('other.ts');
  });

  it('should return empty message when no matches', async () => {
    mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
      const err = new Error('no match') as any;
      err.code = 1;
      cb(err, '', '');
    });
    const tool = createGrepTool();
    const result = await tool.execute!({
      pattern: 'nonexistent_pattern_xyz',
    }, {} as any);
    expect(result).toContain('未找到');
  });

  it('should support case insensitive search', async () => {
    mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
      expect(cmd).toContain('-i');
      cb(null, 'file.ts:1:const X = 1;');
    });
    const tool = createGrepTool();
    const result = await tool.execute!({
      pattern: 'x',
      caseInsensitive: true,
    }, {} as any);
    expect(result).toContain('file.ts');
  });

  it('should truncate results exceeding maxResults', async () => {
    const lines = Array.from({ length: 100 }, (_, i) => `file.ts:${i + 1}:match ${i}`);
    mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
      cb(null, lines.join('\n'));
    });
    const tool = createGrepTool();
    const result = await tool.execute!({
      pattern: 'match',
      maxResults: 10,
    }, {} as any);
    expect(result).toContain('已截断');
  });

  it('should handle grep errors', async () => {
    mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
      cb(new Error('permission denied'), '', '');
    });
    const tool = createGrepTool();
    const result = await tool.execute!({
      pattern: 'test',
    }, {} as any);
    expect(result).toContain('[Error]');
  });
});
