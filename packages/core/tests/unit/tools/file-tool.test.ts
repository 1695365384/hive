/**
 * File 工具单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFileTool } from '../../../src/tools/built-in/file-tool.js';
import { _resetAllowedRoots } from '../../../src/tools/built-in/utils/security.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';

describe('createFileTool', () => {
  let tmpDir: string;

  beforeEach(async () => {
    _resetAllowedRoots();
    tmpDir = join(os.tmpdir(), `hive-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
    // Set working directory so isPathAllowed passes
    process.env.HIVE_WORKING_DIR = tmpDir;
  });

  afterEach(async () => {
    delete process.env.HIVE_WORKING_DIR;
    _resetAllowedRoots();
    try { await rm(tmpDir, { recursive: true, force: true }); } catch {}
  });

  const testFile = () => join(tmpDir, 'test.txt');

  describe('permission control', () => {
    it('should block write operations when only view is allowed', async () => {
      const tool = createFileTool({ allowedCommands: ['view'] });
      const result = await tool.execute!({
        command: 'create',
        file_path: testFile(),
        content: 'hello',
      }, {} as any);
      expect(result).toContain('[Permission]');
      expect(result).toContain('view');
    });

    it('should allow view when only view is allowed', async () => {
      await writeFile(testFile(), 'hello world');
      const tool = createFileTool({ allowedCommands: ['view'] });
      const result = await tool.execute!({
        command: 'view',
        file_path: testFile(),
      }, {} as any);
      expect(result).toContain('hello world');
    });

    it('should allow all commands with full permissions', async () => {
      const tool = createFileTool();
      expect(() => tool.execute!({ command: 'view', file_path: testFile() }, {} as any)).not.toThrow();
    });
  });

  describe('path containment', () => {
    it('should block path traversal attempts', async () => {
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'view',
        file_path: '/etc/passwd',
      }, {} as any);
      expect(result).toContain('[Security]');
      expect(result).toContain('不在允许的工作目录内');
    });

    it('should allow paths within working directory', async () => {
      await writeFile(testFile(), 'safe content');
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'view',
        file_path: testFile(),
      }, {} as any);
      expect(result).toContain('safe content');
    });

    it('should block ../ traversal in create', async () => {
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'create',
        file_path: join(tmpDir, '..', 'etc', 'evil.txt'),
        content: 'malicious',
      }, {} as any);
      expect(result).toContain('[Security]');
    });
  });

  describe('TOCTOU fix', () => {
    it('should return friendly error for non-existent view (no existsSync)', async () => {
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'view',
        file_path: join(tmpDir, 'nonexistent.txt'),
      }, {} as any);
      expect(result).toContain('[Error]');
      expect(result).toContain('不存在');
    });

    it('should return friendly error for non-existent str_replace', async () => {
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'str_replace',
        file_path: join(tmpDir, 'nonexistent.txt'),
        old_str: 'x',
        new_str: 'y',
      }, {} as any);
      expect(result).toContain('[Error]');
      expect(result).toContain('不存在');
    });

    it('should return friendly error for non-existent insert', async () => {
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'insert',
        file_path: join(tmpDir, 'nonexistent.txt'),
        insert_line: 1,
        insert_text: 'new line',
      }, {} as any);
      expect(result).toContain('[Error]');
      expect(result).toContain('不存在');
    });
  });

  describe('view command', () => {
    it('should read file with line numbers', async () => {
      await writeFile(testFile(), 'line1\nline2\nline3');
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'view',
        file_path: testFile(),
      }, {} as any);
      expect(result).toContain('line1');
      expect(result).toContain('line2');
      expect(result).toContain('line3');
      expect(result).toContain('1\t');
    });

    it('should support offset and limit', async () => {
      await writeFile(testFile(), 'line1\nline2\nline3\nline4\nline5');
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'view',
        file_path: testFile(),
        offset: 2,
        limit: 2,
      }, {} as any);
      expect(result).toContain('line2');
      expect(result).toContain('line3');
      expect(result).not.toContain('line1');
      expect(result).not.toContain('line4');
    });
  });

  describe('create command', () => {
    it('should create a new file', async () => {
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'create',
        file_path: testFile(),
        content: 'new content',
      }, {} as any);
      expect(result).toContain('[OK]');
      const { readFile } = await import('node:fs/promises');
      const content = await readFile(testFile(), 'utf-8');
      expect(content).toBe('new content');
    });
  });

  describe('str_replace command', () => {
    it('should replace text in file', async () => {
      await writeFile(testFile(), 'hello world\nfoo bar');
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'str_replace',
        file_path: testFile(),
        old_str: 'hello',
        new_str: 'goodbye',
      }, {} as any);
      expect(result).toContain('[OK]');
      const { readFile } = await import('node:fs/promises');
      const content = await readFile(testFile(), 'utf-8');
      expect(content).toContain('goodbye world');
      expect(content).not.toContain('hello world');
    });

    it('should return error when old_str not found', async () => {
      await writeFile(testFile(), 'hello world');
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'str_replace',
        file_path: testFile(),
        old_str: 'not_found',
        new_str: 'replacement',
      }, {} as any);
      expect(result).toContain('[Error]');
      expect(result).toContain('未找到');
    });
  });

  describe('insert command', () => {
    it('should insert text at specified line', async () => {
      await writeFile(testFile(), 'line1\nline3');
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'insert',
        file_path: testFile(),
        insert_line: 1,
        insert_text: 'line2',
      }, {} as any);
      expect(result).toContain('[OK]');
      const { readFile } = await import('node:fs/promises');
      const content = await readFile(testFile(), 'utf-8');
      expect(content).toBe('line1\nline2\nline3');
    });
  });

  describe('sensitive file protection', () => {
    it('should block reading .env files', async () => {
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'view',
        file_path: join(tmpDir, '.env'),
      }, {} as any);
      expect(result).toContain('[Security]');
    });

    it('should block writing to .env files', async () => {
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'create',
        file_path: join(tmpDir, '.env'),
        content: 'SECRET=key',
      }, {} as any);
      expect(result).toContain('[Security]');
    });

    it('should block reading SSH keys', async () => {
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'view',
        file_path: join(tmpDir, 'id_rsa'),
      }, {} as any);
      expect(result).toContain('[Security]');
    });
  });
});
