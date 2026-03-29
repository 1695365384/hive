/**
 * File 工具单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFileTool } from '../../../src/tools/built-in/file-tool.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import os from 'node:os';

describe('createFileTool', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(os.tmpdir(), `hive-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    // 清理临时文件
    const { rm } = await import('node:fs/promises');
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

    it('should return error for non-existent file', async () => {
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'view',
        file_path: join(tmpDir, 'nonexistent.txt'),
      }, {} as any);
      expect(result).toContain('[Error]');
      expect(result).toContain('不存在');
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
      expect(existsSync(testFile())).toBe(true);
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
        file_path: '/tmp/.env',
      }, {} as any);
      expect(result).toContain('[Security]');
    });

    it('should block writing to .env files', async () => {
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'create',
        file_path: '/tmp/.env',
        content: 'SECRET=key',
      }, {} as any);
      expect(result).toContain('[Security]');
    });

    it('should block reading SSH keys', async () => {
      const tool = createFileTool();
      const result = await tool.execute!({
        command: 'view',
        file_path: '/home/user/.ssh/id_rsa',
      }, {} as any);
      expect(result).toContain('[Security]');
    });
  });
});
