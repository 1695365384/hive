/**
 * Bash 工具单元测试
 */

import { describe, it, expect, vi } from 'vitest';
import { createBashTool } from '../../../src/tools/built-in/bash-tool.js';

// Mock child_process.exec
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

import { exec } from 'node:child_process';
const mockExec = vi.mocked(exec);

describe('createBashTool', () => {
  describe('permission control', () => {
    it('should block execution when allowed=false', async () => {
      const tool = createBashTool({ allowed: false });
      const result = await tool.execute!({ command: 'echo hello', timeout: 5000 }, {} as any);
      expect(result).toContain('[Security]');
      expect(result).toContain('无权限');
      expect(mockExec).not.toHaveBeenCalled();
    });

    it('should allow execution when allowed=true', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        cb(null, 'hello\n', '');
      });
      const tool = createBashTool({ allowed: true });
      const result = await tool.execute!({ command: 'echo hello', timeout: 5000 }, {} as any);
      expect(result).toBe('hello\n');
      expect(mockExec).toHaveBeenCalled();
    });

    it('should allow execution by default (no options)', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        cb(null, 'output', '');
      });
      const tool = createBashTool();
      const result = await tool.execute!({ command: 'ls', timeout: 5000 }, {} as any);
      expect(result).toBe('output');
    });
  });

  describe('dangerous command check', () => {
    it('should block rm -rf /', async () => {
      const tool = createBashTool({ allowed: true });
      const result = await tool.execute!({ command: 'rm -rf /', timeout: 5000 }, {} as any);
      expect(result).toContain('[Security]');
      expect(result).toContain('阻止危险命令');
      expect(mockExec).not.toHaveBeenCalled();
    });

    it('should block fork bombs', async () => {
      const tool = createBashTool({ allowed: true });
      const result = await tool.execute!({ command: ':(){ :|:& };:', timeout: 5000 }, {} as any);
      expect(result).toContain('[Security]');
    });

    it('should allow safe commands', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        cb(null, 'file.ts\n', '');
      });
      const tool = createBashTool({ allowed: true });
      const result = await tool.execute!({ command: 'cat file.ts', timeout: 5000 }, {} as any);
      expect(result).toBe('file.ts\n');
      expect(mockExec).toHaveBeenCalled();
    });
  });

  describe('timeout handling', () => {
    it('should report timeout error', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        const err = new Error('Command timed out') as NodeJS.ErrnoException;
        err.killed = true;
        cb(err, '', '');
      });
      const tool = createBashTool({ allowed: true });
      const result = await tool.execute!({ command: 'sleep 999', timeout: 1000 }, {} as any);
      expect(result).toContain('[Error]');
      expect(result).toContain('超时');
    });
  });

  describe('output truncation', () => {
    it('should truncate long output', async () => {
      const longOutput = 'x'.repeat(40000);
      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        cb(null, longOutput, '');
      });
      const tool = createBashTool({ allowed: true });
      const result = await tool.execute!({ command: 'cat bigfile', timeout: 5000 }, {} as any);
      expect(result.length).toBeLessThan(40000);
      expect(result).toContain('[输出已截断');
    });
  });

  describe('error handling', () => {
    it('should handle command execution error', async () => {
      mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
        const err = new Error('command not found');
        cb(err, '', 'command not found');
      });
      const tool = createBashTool({ allowed: true });
      const result = await tool.execute!({ command: 'nonexistent_cmd', timeout: 5000 }, {} as any);
      // exec returns stdout+stderr on non-zero exit
      expect(result).toBe('command not found');
    });
  });
});
