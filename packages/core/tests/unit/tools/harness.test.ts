/**
 * Harness 层单元测试
 */

import { describe, it, expect } from 'vitest';
import { serializeToolResult } from '../../../src/tools/harness/serializer.js';
import { getHint, getAllHintTemplates } from '../../../src/tools/harness/hint-registry.js';
import { isRetryable, retryWithBackoff } from '../../../src/tools/harness/retry.js';
import { withHarness } from '../../../src/tools/harness/with-harness.js';
import type { ToolResult } from '../../../src/tools/harness/types.js';

// ============================================
// types.ts 测试
// ============================================

describe('ToolResult type', () => {
  it('should represent a successful result', () => {
    const result: ToolResult = {
      ok: true,
      code: 'OK',
      data: '文件已创建: /path/to/file.ts',
    };
    expect(result.ok).toBe(true);
    expect(result.code).toBe('OK');
    expect(result.data).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('should represent a failure result with context', () => {
    const result: ToolResult = {
      ok: false,
      code: 'MATCH_FAILED',
      error: '未找到要替换的文本',
      context: { path: '/path/to/file.ts' },
    };
    expect(result.ok).toBe(false);
    expect(result.code).toBe('MATCH_FAILED');
    expect(result.context?.path).toBe('/path/to/file.ts');
  });
});

// ============================================
// serializer.ts 测试
// ============================================

describe('serializeToolResult', () => {
  it('should serialize OK result without hint', () => {
    const result: ToolResult = {
      ok: true,
      code: 'OK',
      data: '文件已创建: /path/to/file.ts',
    };
    const output = serializeToolResult(result, getAllHintTemplates());
    expect(output).toContain('[OK]');
    expect(output).toContain('文件已创建');
    expect(output).not.toContain('[Hint]');
  });

  it('should serialize error result with hint', () => {
    const result: ToolResult = {
      ok: false,
      code: 'MATCH_FAILED',
      error: '未找到要替换的文本',
      context: { path: '/path/to/file.ts' },
    };
    const output = serializeToolResult(result, getAllHintTemplates());
    expect(output).toContain('[Error]');
    expect(output).toContain('未找到要替换的文本');
    expect(output).toContain('[Hint]');
  });

  it('should serialize error result without hint when no template exists', () => {
    const result: ToolResult = {
      ok: false,
      code: 'UNKNOWN_CODE',
      error: 'something went wrong',
    };
    const output = serializeToolResult(result, {});
    expect(output).toContain('[Error]');
    expect(output).not.toContain('[Hint]');
  });

  it('should serialize SENSITIVE_FILE as Security prefix with hint', () => {
    const result: ToolResult = {
      ok: false,
      code: 'SENSITIVE_FILE',
      error: '阻止写入敏感文件: SSH 密钥目录',
      context: { path: '/home/user/.ssh/id_rsa', description: 'SSH 密钥目录' },
    };
    const output = serializeToolResult(result, getAllHintTemplates());
    expect(output).toContain('[Security]');
    expect(output).toContain('[Hint]');
  });

  it('should serialize DANGEROUS_CMD as Security prefix with hint', () => {
    const result: ToolResult = {
      ok: false,
      code: 'DANGEROUS_CMD',
      error: '阻止危险命令: 递归删除根目录',
      context: { command: 'rm -rf /', description: '递归删除根目录' },
    };
    const output = serializeToolResult(result, getAllHintTemplates());
    expect(output).toContain('[Security]');
    expect(output).toContain('[Hint]');
  });

  it('should serialize COMMAND_BLOCKED as Security prefix with hint', () => {
    const result: ToolResult = {
      ok: false,
      code: 'COMMAND_BLOCKED',
      error: '命令被策略阻止: /usr/bin/evil',
      context: { command: '/usr/bin/evil' },
    };
    const output = serializeToolResult(result, getAllHintTemplates());
    expect(output).toContain('[Security]');
    expect(output).toContain('[Hint]');
  });

  it('should use custom hint when provided in ToolResult', () => {
    const result: ToolResult = {
      ok: false,
      code: 'MATCH_FAILED',
      error: '未找到要替换的文本',
      context: { path: '/path/to/file.ts' },
      hint: '自定义提示: 请检查缩进',
    };
    const output = serializeToolResult(result, getAllHintTemplates());
    expect(output).toContain('[Hint]');
    expect(output).toContain('自定义提示: 请检查缩进');
  });

  it('should serialize PERMISSION as Permission prefix', () => {
    const result: ToolResult = {
      ok: false,
      code: 'PERMISSION',
      error: '当前 Agent 无权限执行 create 操作',
      context: { command: 'create' },
    };
    const output = serializeToolResult(result, getAllHintTemplates());
    expect(output).toContain('[Permission]');
  });

  it('should serialize MATCH_AMBIGUOUS with hint', () => {
    const result: ToolResult = {
      ok: false,
      code: 'MATCH_AMBIGUOUS',
      error: '找到 3 处匹配，无法确定替换位置',
      context: { path: '/path/to/file.ts', matchCount: 3 },
    };
    const output = serializeToolResult(result, getAllHintTemplates());
    expect(output).toContain('[Error]');
    expect(output).toContain('[Hint]');
  });
});

// ============================================
// hint-registry.ts 测试
// ============================================

describe('HintRegistry', () => {
  it('should return file-tool hint for MATCH_FAILED', () => {
    const hint = getHint('MATCH_FAILED', { path: '/path/to/file.ts' });
    expect(hint).toBeDefined();
    expect(hint).toContain('/path/to/file.ts');
  });

  it('should return file-tool hint for NOT_FOUND', () => {
    const hint = getHint('NOT_FOUND', { path: '/path/to/file.ts' });
    expect(hint).toBeDefined();
    expect(hint).toContain('/path/to/file.ts');
  });

  it('should return file-tool hint for PERMISSION', () => {
    const hint = getHint('PERMISSION', { command: 'create', allowed: ['view'] });
    expect(hint).toBeDefined();
  });

  it('should return bash-tool hint for EXEC_ERROR', () => {
    const hint = getHint('EXEC_ERROR', { command: 'npm install' });
    expect(hint).toBeDefined();
  });

  it('should return undefined for unknown error code', () => {
    const hint = getHint('NONEXISTENT_CODE', {});
    expect(hint).toBeUndefined();
  });

  it('should handle empty context gracefully', () => {
    const hint = getHint('MATCH_FAILED', {});
    expect(hint).toBeDefined();
  });

  it('should return hint for MATCH_AMBIGUOUS', () => {
    const hint = getHint('MATCH_AMBIGUOUS', { path: '/test.ts', matchCount: 3 });
    expect(hint).toBeDefined();
    expect(hint).toContain('3');
  });
});

// ============================================
// retry.ts 测试
// ============================================

describe('retry logic', () => {
  it('should identify TRANSIENT errors as retryable', () => {
    expect(isRetryable('TIMEOUT')).toBe(true);
    expect(isRetryable('NETWORK')).toBe(true);
    expect(isRetryable('RATE_LIMITED')).toBe(true);
  });

  it('should not retry RECOVERABLE errors', () => {
    expect(isRetryable('MATCH_FAILED')).toBe(false);
    expect(isRetryable('NOT_FOUND')).toBe(false);
    expect(isRetryable('PERMISSION')).toBe(false);
  });

  it('should not retry BLOCKED errors', () => {
    expect(isRetryable('DANGEROUS_CMD')).toBe(false);
    expect(isRetryable('COMMAND_BLOCKED')).toBe(false);
    expect(isRetryable('SENSITIVE_FILE')).toBe(false);
  });

  it('should retry transient errors up to maxRetries times', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      return { ok: false, code: 'TIMEOUT' as const, error: 'timeout' };
    };
    const result = await retryWithBackoff(fn, { maxRetries: 2, baseDelay: 10 });
    expect(attempts).toBe(3); // 1 initial + 2 retries
    expect(result.code).toBe('TIMEOUT');
  });

  it('should return success on first attempt if no error', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      return { ok: true, code: 'OK' as const, data: 'success' };
    };
    const result = await retryWithBackoff(fn, { maxRetries: 2, baseDelay: 10 });
    expect(attempts).toBe(1);
    expect(result.ok).toBe(true);
  });

  it('should stop retrying on success', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        return { ok: false, code: 'TIMEOUT' as const, error: 'timeout' };
      }
      return { ok: true, code: 'OK' as const, data: 'recovered' };
    };
    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelay: 10 });
    expect(attempts).toBe(2);
    expect(result.ok).toBe(true);
  });

  it('should not retry non-transient errors', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      return { ok: false, code: 'MATCH_FAILED' as const, error: 'not found' };
    };
    const result = await retryWithBackoff(fn, { maxRetries: 2, baseDelay: 10 });
    expect(attempts).toBe(1); // no retry for non-transient
    expect(result.code).toBe('MATCH_FAILED');
  });
});

// ============================================
// with-harness.ts 测试
// ============================================

describe('withHarness', () => {
  it('should wrap rawTool and return string for OK result', async () => {
    const rawTool = {
      execute: async () => ({ ok: true, code: 'OK' as const, data: 'file created' }),
    };
    const wrapped = withHarness(rawTool as any, {});
    const result = await wrapped.execute!({} as any, {} as any);
    expect(typeof result).toBe('string');
    expect(result).toContain('[OK]');
  });

  it('should inject hint for RECOVERABLE errors', async () => {
    const rawTool = {
      execute: async () => ({
        ok: false,
        code: 'MATCH_FAILED' as const,
        error: '未找到要替换的文本',
        context: { path: '/test/file.ts' },
      }),
    };
    const wrapped = withHarness(rawTool as any, {});
    const result = await wrapped.execute!({} as any, {} as any);
    expect(result).toContain('[Error]');
    expect(result).toContain('[Hint]');
  });

  it('should retry TRANSIENT errors', async () => {
    let attempts = 0;
    const rawTool = {
      execute: async () => {
        attempts++;
        if (attempts === 1) {
          return { ok: false, code: 'TIMEOUT' as const, error: 'timeout', context: { timeout: 5000 } };
        }
        return { ok: true, code: 'OK' as const, data: 'recovered' };
      },
    };
    const wrapped = withHarness(rawTool as any, {});
    const result = await wrapped.execute!({} as any, {} as any);
    expect(attempts).toBe(2);
    expect(result).toContain('[OK]');
  });

  it('should catch tool exceptions and return error string', async () => {
    const rawTool = {
      execute: async () => { throw new Error('internal crash'); },
    };
    const wrapped = withHarness(rawTool as any, {});
    const result = await wrapped.execute!({} as any, {} as any);
    expect(typeof result).toBe('string');
    expect(result).toContain('[Error]');
    expect(result).toContain('工具内部异常');
  });

  it('should preserve description and inputSchema from rawTool', () => {
    const rawTool = {
      description: 'test tool',
      inputSchema: { type: 'object' },
      execute: async () => ({ ok: true, code: 'OK' as const }),
    };
    const wrapped = withHarness(rawTool as any, {});
    expect(wrapped.description).toBe('test tool');
    expect(wrapped.inputSchema).toEqual({ type: 'object' });
  });
});
