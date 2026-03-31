/**
 * file-tool rawTool 单元测试
 *
 * 测试 createRawFileTool 返回 ToolResult 而非 string。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRawFileTool } from '../../../src/tools/built-in/file-tool.js';
import { _resetAllowedRoots } from '../../../src/tools/built-in/utils/security.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';
import type { ToolResult } from '../../../src/tools/harness/types.js';

describe('createRawFileTool', () => {
  let tmpDir: string;

  beforeEach(async () => {
    _resetAllowedRoots();
    tmpDir = join(os.tmpdir(), `hive-raw-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
    process.env.HIVE_WORKING_DIR = tmpDir;
  });

  afterEach(async () => {
    delete process.env.HIVE_WORKING_DIR;
    _resetAllowedRoots();
    try { await rm(tmpDir, { recursive: true, force: true }); } catch {}
  });

  const testFile = () => join(tmpDir, 'test.txt');

  describe('ToolResult return type', () => {
    it('should return ToolResult for OK (create)', async () => {
      const tool = createRawFileTool();
      const result = await tool.execute!({
        command: 'create',
        file_path: testFile(),
        content: 'hello',
      }, {} as any) as ToolResult;

      expect(result).toHaveProperty('ok', true);
      expect(result).toHaveProperty('code', 'OK');
      expect(typeof result).not.toBe('string');
    });

    it('should return ToolResult for PERMISSION error', async () => {
      const tool = createRawFileTool({ allowedCommands: ['view'] });
      const result = await tool.execute!({
        command: 'create',
        file_path: testFile(),
        content: 'hello',
      }, {} as any) as ToolResult;

      expect(result).toHaveProperty('ok', false);
      expect(result).toHaveProperty('code', 'PERMISSION');
      expect(result.context).toHaveProperty('command', 'create');
    });

    it('should return ToolResult for PATH_BLOCKED', async () => {
      const tool = createRawFileTool();
      const result = await tool.execute!({
        command: 'view',
        file_path: '/etc/passwd',
      }, {} as any) as ToolResult;

      expect(result).toHaveProperty('ok', false);
      expect(result).toHaveProperty('code', 'PATH_BLOCKED');
      expect(result.context).toHaveProperty('path');
    });

    it('should return ToolResult for SENSITIVE_FILE', async () => {
      const tool = createRawFileTool();
      const result = await tool.execute!({
        command: 'view',
        file_path: join(tmpDir, '.env'),
      }, {} as any) as ToolResult;

      expect(result).toHaveProperty('ok', false);
      expect(result).toHaveProperty('code', 'SENSITIVE_FILE');
    });

    it('should return ToolResult for NOT_FOUND', async () => {
      const tool = createRawFileTool();
      const result = await tool.execute!({
        command: 'view',
        file_path: join(tmpDir, 'nonexistent.txt'),
      }, {} as any) as ToolResult;

      expect(result).toHaveProperty('ok', false);
      expect(result).toHaveProperty('code', 'NOT_FOUND');
      expect(result.context).toHaveProperty('path');
    });

    it('should return ToolResult for MATCH_FAILED', async () => {
      await writeFile(testFile(), 'hello world');
      const tool = createRawFileTool();
      const result = await tool.execute!({
        command: 'str_replace',
        file_path: testFile(),
        old_str: 'not_found',
        new_str: 'replacement',
      }, {} as any) as ToolResult;

      expect(result).toHaveProperty('ok', false);
      expect(result).toHaveProperty('code', 'MATCH_FAILED');
      expect(result.context).toHaveProperty('path');
    });

    it('should return ToolResult for INVALID_PARAM (line out of range)', async () => {
      await writeFile(testFile(), 'line1\nline2');
      const tool = createRawFileTool();
      const result = await tool.execute!({
        command: 'insert',
        file_path: testFile(),
        insert_line: 99,
        insert_text: 'new line',
      }, {} as any) as ToolResult;

      expect(result).toHaveProperty('ok', false);
      expect(result).toHaveProperty('code', 'INVALID_PARAM');
      expect(result.context).toHaveProperty('line', 99);
      expect(result.context).toHaveProperty('total', 2);
    });
  });
});
