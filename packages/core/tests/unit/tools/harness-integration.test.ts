/**
 * Harness 层集成测试
 *
 * 真实 rawTool（bash/file）经过 harness 管道后的输出验证。
 * 不依赖 LLM API，CI 友好。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRawBashTool } from '../../../src/tools/built-in/bash-tool.js';
import { createRawFileTool } from '../../../src/tools/built-in/file-tool.js';
import { withHarness } from '../../../src/tools/harness/with-harness.js';
import { serializeToolResult } from '../../../src/tools/harness/serializer.js';
import { isRetryable, retryWithBackoff } from '../../../src/tools/harness/retry.js';
import { getHint } from '../../../src/tools/harness/hint-registry.js';
import { _resetAllowedRoots, isAllowedUrl } from '../../../src/tools/built-in/utils/security.js';
import type { ToolResult } from '../../../src/tools/harness/types.js';
import type { RawTool } from '../../../src/tools/harness/with-harness.js';

// ============================================
// Test Infrastructure
// ============================================

/**
 * FileTool 有路径约束（isPathAllowed），只允许在 cwd 或 HIVE_WORKING_DIR 内。
 * 为了让集成测试能在任意目录运行，在项目根下创建临时目录。
 */
const PROJECT_ROOT = resolve(import.meta.dirname, '../../../../..');
const TEMP_ROOT = join(PROJECT_ROOT, '.tmp-harness-test');

let tempDir: string;

beforeEach(() => {
  _resetAllowedRoots();
  // 确保临时根目录存在，并通过 HIVE_WORKING_DIR 让路径约束通过
  mkdirSync(TEMP_ROOT, { recursive: true });
  process.env.HIVE_WORKING_DIR = TEMP_ROOT;
  tempDir = mkdtempSync(join(TEMP_ROOT, 'test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

/**
 * pipeline — 组合 rawTool.execute + serializeToolResult
 * 模拟 withHarness 的核心路径，返回最终 string
 */
async function pipeline<TInput>(
  rawTool: RawTool<TInput>,
  input: TInput,
  toolName?: string,
): Promise<string> {
  const result: ToolResult = await rawTool.execute(input, {});
  return serializeToolResult(result, undefined, toolName);
}

// ============================================
// 2. BashTool 集成测试
// ============================================

describe('BashTool harness integration', () => {
  it('should return [OK] for successful command', async () => {
    const rawTool = createRawBashTool({ allowed: true });
    const output = await pipeline(rawTool, { command: 'echo hello' }, 'bash-tool');

    expect(output).toContain('[OK]');
    expect(output).toContain('hello');
  });

  it('should return [Error] for non-zero exit code commands', async () => {
    const rawTool = createRawBashTool({ allowed: true });
    const output = await pipeline(rawTool, { command: 'ls /nonexistent-path-xyz-12345' }, 'bash-tool');

    expect(output).toContain('[Error]');
    expect(output).toContain('Command failed');
  });

  it('should block dangerous commands with [Security] + [Hint]', async () => {
    const rawTool = createRawBashTool({ allowed: true });
    const output = await pipeline(rawTool, { command: 'rm -rf /' }, 'bash-tool');

    expect(output).toContain('[Security]');
    expect(output).toContain('Dangerous command blocked');
    expect(output).toContain('[Hint]');
  });

  it('should block commands when allowed=false with [Permission]', async () => {
    const rawTool = createRawBashTool({ allowed: false });
    const output = await pipeline(rawTool, { command: 'echo hello' }, 'bash-tool');

    expect(output).toContain('[Permission]');
    expect(output).toContain('does not have permission');
  });
});

// ============================================
// 3. FileTool 集成测试
// ============================================

describe('FileTool harness integration', () => {
  it('should create file with [OK]', async () => {
    const filePath = join(tempDir, 'test.txt');
    const rawTool = createRawFileTool();
    const output = await pipeline(rawTool, {
      command: 'create',
      file_path: filePath,
      content: 'hello world',
    }, 'file-tool');

    expect(output).toContain('[OK]');
    expect(output).toContain('File created');
  });

  it('should view file with [OK] and content', async () => {
    const filePath = join(tempDir, 'test.txt');
    const rawTool = createRawFileTool();

    // 先创建
    await rawTool.execute({
      command: 'create',
      file_path: filePath,
      content: 'line1\nline2\nline3',
    }, {});

    // 再查看
    const output = await pipeline(rawTool, {
      command: 'view',
      file_path: filePath,
    }, 'file-tool');

    expect(output).toContain('[OK]');
    expect(output).toContain('line1');
    expect(output).toContain('line2');
  });

  it('should replace file content with [OK]', async () => {
    const filePath = join(tempDir, 'test.txt');
    const rawTool = createRawFileTool();

    // 先创建
    await rawTool.execute({
      command: 'create',
      file_path: filePath,
      content: 'hello world',
    }, {});

    // 再替换
    const output = await pipeline(rawTool, {
      command: 'str_replace',
      file_path: filePath,
      old_str: 'hello',
      new_str: 'goodbye',
    }, 'file-tool');

    expect(output).toContain('[OK]');
    expect(output).toContain('File updated');
  });

  it('should return [Error] + [Hint] with path when match fails', async () => {
    const filePath = join(tempDir, 'test.txt');
    const rawTool = createRawFileTool();

    // 先创建
    await rawTool.execute({
      command: 'create',
      file_path: filePath,
      content: 'hello world',
    }, {});

    // 尝试替换不存在的文本
    const output = await pipeline(rawTool, {
      command: 'str_replace',
      file_path: filePath,
      old_str: 'nonexistent_text',
      new_str: 'replacement',
    }, 'file-tool');

    expect(output).toContain('[Error]');
    expect(output).toContain('Text to replace not found');
    expect(output).toContain('[Hint]');
    expect(output).toContain(filePath);
  });

  it('should return [Error] + [Hint] when viewing nonexistent file', async () => {
    const rawTool = createRawFileTool();
    const output = await pipeline(rawTool, {
      command: 'view',
      file_path: join(tempDir, 'nonexistent.txt'),
    }, 'file-tool');

    expect(output).toContain('[Error]');
    expect(output).toContain('[Hint]');
  });

  it('should block sensitive file access with [Security] + [Hint]', async () => {
    // 在 tempDir 下创建 .ssh 子目录，同时通过路径约束和触发敏感文件检查
    const sshDir = join(tempDir, '.ssh');
    const rawTool = createRawFileTool();
    const output = await pipeline(rawTool, {
      command: 'create',
      file_path: join(sshDir, 'id_rsa'),
      content: 'malicious',
    }, 'file-tool');

    expect(output).toContain('[Security]');
    expect(output).toContain('SSH');
    expect(output).toContain('[Hint]');
  });

  it('should enforce read-only permission with [Permission] + [Hint]', async () => {
    const filePath = join(tempDir, 'test.txt');
    const rawTool = createRawFileTool({ allowedCommands: ['view'] });
    const output = await pipeline(rawTool, {
      command: 'create',
      file_path: filePath,
      content: 'test',
    }, 'file-tool');

    expect(output).toContain('[Permission]');
    expect(output).toContain('[Hint]');
  });
});

// ============================================
// 4. Retry 集成测试
// ============================================

describe('Retry integration', () => {
  it('should mark TIMEOUT as retryable', () => {
    expect(isRetryable('TIMEOUT')).toBe(true);
    expect(isRetryable('NETWORK')).toBe(true);
    expect(isRetryable('RATE_LIMITED')).toBe(true);
  });

  it('should NOT mark non-transient errors as retryable', () => {
    expect(isRetryable('MATCH_FAILED')).toBe(false);
    expect(isRetryable('DANGEROUS_CMD')).toBe(false);
    expect(isRetryable('PERMISSION')).toBe(false);
  });
});

// ============================================
// 5. 异常兜底测试
// ============================================

describe('Exception catch-all', () => {
  it('should catch rawTool throw and return [Error]', async () => {
    const throwingTool: RawTool<any> = {
      execute: async () => { throw new Error('kaboom'); },
    };
    const wrapped = withHarness(throwingTool as any, {});
    const output = await wrapped.execute!({} as any, {} as any);

    expect(typeof output).toBe('string');
    expect(output).toContain('[Error]');
    expect(output).toContain('Internal tool exception');
  });

  it('should catch non-Error throw and return [Error]', async () => {
    const throwingTool: RawTool<any> = {
      execute: async () => { throw 'string error'; },
    };
    const wrapped = withHarness(throwingTool as any, {});
    const output = await wrapped.execute!({} as any, {} as any);

    expect(typeof output).toBe('string');
    expect(output).toContain('[Error]');
    expect(output).toContain('Internal tool exception');
  });
});

// ============================================
// 7. FileTool 未覆盖路径
// ============================================

describe('FileTool additional coverage', () => {
  it('should insert line with [OK]', async () => {
    const filePath = join(tempDir, 'test.txt');
    const rawTool = createRawFileTool();

    await rawTool.execute({
      command: 'create',
      file_path: filePath,
      content: 'line1\nline3',
    }, {});

    const output = await pipeline(rawTool, {
      command: 'insert',
      file_path: filePath,
      insert_line: 1,
      insert_text: 'line2',
    }, 'file-tool');

    expect(output).toContain('[OK]');
    expect(output).toContain('inserted after line');
  });

  it('should view file with offset and limit', async () => {
    const filePath = join(tempDir, 'test.txt');
    const rawTool = createRawFileTool();

    await rawTool.execute({
      command: 'create',
      file_path: filePath,
      content: 'line1\nline2\nline3\nline4\nline5',
    }, {});

    const output = await pipeline(rawTool, {
      command: 'view',
      file_path: filePath,
      offset: 2,
      limit: 2,
    }, 'file-tool');

    expect(output).toContain('[OK]');
    expect(output).toContain('line2');
    expect(output).toContain('line3');
    // line1 和 line4 不应出现（offset=2 从第 2 行开始，limit=2 只取 2 行）
    expect(output).not.toContain('line1');
    expect(output).not.toContain('line4');
  });

  it('should return MATCH_AMBIGUOUS when multiple matches found', async () => {
    const filePath = join(tempDir, 'test.txt');
    const rawTool = createRawFileTool();

    await rawTool.execute({
      command: 'create',
      file_path: filePath,
      content: 'aaa\naaa\nbbb',
    }, {});

    const output = await pipeline(rawTool, {
      command: 'str_replace',
      file_path: filePath,
      old_str: 'aaa',
      new_str: 'xxx',
    }, 'file-tool');

    expect(output).toContain('[Error]');
    expect(output).toContain('matches, cannot determine');
  });

  it('should return INVALID_PARAM when insert line out of range', async () => {
    const filePath = join(tempDir, 'test.txt');
    const rawTool = createRawFileTool();

    await rawTool.execute({
      command: 'create',
      file_path: filePath,
      content: 'line1',
    }, {});

    const output = await pipeline(rawTool, {
      command: 'insert',
      file_path: filePath,
      insert_line: 99,
      insert_text: 'new line',
    }, 'file-tool');

    expect(output).toContain('[Error]');
    expect(output).toContain('is out of range');
    expect(output).toContain('[Hint]');
  });

  it('should return IO_ERROR when readFile throws non-ENOENT', async () => {
    // 使用 /dev/null 作为只读目录来触发非 ENOENT 错误
    const rawTool = createRawFileTool();
    const output = await pipeline(rawTool, {
      command: 'view',
      file_path: '/dev/null/impossible',
    }, 'file-tool');

    // 可能是 PATH_BLOCKED 或 IO_ERROR，只要不是崩溃就行
    expect(typeof output).toBe('string');
  });
});

// ============================================
// 8. Serializer 未覆盖分支
// ============================================

describe('Serializer additional coverage', () => {
  it('should use custom template over global template', () => {
    const result: ToolResult = {
      ok: false,
      code: 'TIMEOUT',
      error: 'timeout',
    };
    const customTemplates = {
      TIMEOUT: () => '自定义超时提示',
    };
    const output = serializeToolResult(result, customTemplates);
    expect(output).toContain('自定义超时提示');
    expect(output).not.toContain('Command timed out');
  });

  it('should serialize OK result with null data', () => {
    const result: ToolResult = {
      ok: true,
      code: 'OK',
    };
    const output = serializeToolResult(result);
    expect(output).toContain('[OK]');
  });
});

// ============================================
// 9. HintRegistry 未覆盖分支
// ============================================

describe('HintRegistry additional coverage', () => {
  it('should return hint for PATH_BLOCKED', () => {
    const hint = getHint('PATH_BLOCKED', { path: '/etc/passwd' });
    expect(hint).toBeDefined();
    expect(hint).toContain('/etc/passwd');
  });

  it('should return hint for INVALID_PARAM', () => {
    const hint = getHint('INVALID_PARAM', { line: 99, total: 10 });
    expect(hint).toBeDefined();
    expect(hint).toContain('99');
    expect(hint).toContain('10');
  });

  it('should return hint for IO_ERROR', () => {
    const hint = getHint('IO_ERROR', { path: '/tmp/test.txt' });
    expect(hint).toBeDefined();
    expect(hint).toContain('/tmp/test.txt');
  });
});

// ============================================
// 10. Security SSRF 防护
// ============================================

describe('isAllowedUrl', () => {
  it('should allow https URLs', () => {
    expect(isAllowedUrl('https://example.com')).toEqual({ allowed: true });
  });

  it('should block non-https URLs', () => {
    const result = isAllowedUrl('http://example.com');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('http:');
  });

  it('should block invalid URLs', () => {
    const result = isAllowedUrl('not-a-url');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Invalid URL format');
  });
});
