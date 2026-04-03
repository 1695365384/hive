/**
 * P1.4: ToolCache 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolCache, withHarness } from '../../src/tools/harness/with-harness.js';
import type { ToolResult } from '../../src/tools/harness/types.js';

describe('ToolCache', () => {
  let cache: ToolCache;

  beforeEach(() => {
    cache = new ToolCache();
  });

  it('returns null for non-cacheable tools', () => {
    expect(cache.get('bash-tool', { command: 'echo hi' })).toBeNull();
  });

  it('returns null for cacheable tool before first set', () => {
    expect(cache.get('file-tool', { path: '/foo.ts', action: 'read' })).toBeNull();
  });

  it('stores and retrieves cached result for file-tool', () => {
    const input = { path: '/foo.ts', action: 'read' };
    cache.set('file-tool', input, '[OK] file content');
    expect(cache.get('file-tool', input)).toBe('[OK] file content');
  });

  it('returns null for glob-tool before set', () => {
    expect(cache.get('glob-tool', { pattern: '**/*.ts' })).toBeNull();
  });

  it('stores and retrieves for glob-tool', () => {
    cache.set('glob-tool', { pattern: '**/*.ts' }, '[OK] src/a.ts\nsrc/b.ts');
    expect(cache.get('glob-tool', { pattern: '**/*.ts' })).toBe('[OK] src/a.ts\nsrc/b.ts');
  });

  it('stores and retrieves for grep-tool', () => {
    cache.set('grep-tool', { pattern: 'export', path: 'src' }, '[OK] src/a.ts:1: export');
    expect(cache.get('grep-tool', { pattern: 'export', path: 'src' })).toBe('[OK] src/a.ts:1: export');
  });

  it('different inputs produce different cache keys', () => {
    cache.set('file-tool', { path: '/a.ts' }, 'result-a');
    cache.set('file-tool', { path: '/b.ts' }, 'result-b');
    expect(cache.get('file-tool', { path: '/a.ts' })).toBe('result-a');
    expect(cache.get('file-tool', { path: '/b.ts' })).toBe('result-b');
  });

  it('clear() removes all entries', () => {
    cache.set('file-tool', { path: '/a.ts' }, 'result');
    cache.clear();
    expect(cache.get('file-tool', { path: '/a.ts' })).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('does not cache write operations (bash-tool)', () => {
    cache.set('bash-tool', { command: 'ls' }, 'output');
    // bash-tool is not in CACHEABLE_TOOLS, so get should still return null
    expect(cache.get('bash-tool', { command: 'ls' })).toBeNull();
  });
});

describe('withHarness with cache integration', () => {
  it('returns cached result on second call without re-executing tool', async () => {
    let callCount = 0;
    const rawTool = {
      description: 'test tool',
      execute: async (_input: unknown): Promise<ToolResult> => {
        callCount++;
        return { ok: true, code: 'OK', data: `result-${callCount}` };
      },
    };

    const cache = new ToolCache();
    const wrapped = withHarness(rawTool, { toolName: 'file-tool' }, cache);

    const first = await wrapped.execute!({ path: '/test.ts' }, {});
    const second = await wrapped.execute!({ path: '/test.ts' }, {});

    expect(callCount).toBe(1); // tool only called once
    expect(first).toBe(second); // both calls return same result
  });

  it('does not use cache when cache is not provided', async () => {
    let callCount = 0;
    const rawTool = {
      description: 'test tool',
      execute: async (_input: unknown): Promise<ToolResult> => {
        callCount++;
        return { ok: true, code: 'OK', data: 'result' };
      },
    };

    const wrapped = withHarness(rawTool, { toolName: 'file-tool' }); // no cache

    await wrapped.execute!({ path: '/test.ts' }, {});
    await wrapped.execute!({ path: '/test.ts' }, {});

    expect(callCount).toBe(2); // called twice, no caching
  });
});
