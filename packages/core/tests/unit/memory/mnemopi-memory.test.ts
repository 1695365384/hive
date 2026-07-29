/**
 * MnemopiMemory — helpers always; query-aware recall mocked for vitest.
 * Full FTS round-trip is covered by `scripts/smoke-mnemopi.mjs` (Bun).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  isMnemopiRuntimeAvailable,
  resolveMnemopiDbPath,
  sanitizeMemoryBank,
} from '../../../src/memory/MnemopiMemory.js';

describe('MnemopiMemory helpers', () => {
  it('sanitizes bank names from user ids', () => {
    expect(sanitizeMemoryBank('user/ada')).toBe('user_ada');
    expect(sanitizeMemoryBank('')).toBe('default');
  });

  it('resolves workspace db path under .hive/mnemopi', () => {
    expect(resolveMnemopiDbPath('/tmp/ws')).toBe('/tmp/ws/.hive/mnemopi/mnemopi.db');
  });

  it('reports Bun availability for runtime gating', () => {
    expect(typeof isMnemopiRuntimeAvailable()).toBe('boolean');
  });
});

describe('MnemopiMemory readMemory query recall (deterministic)', () => {
  it('returns non-empty recall when query matches stored fact', async () => {
    const recall = vi.fn(async (q: string) => {
      if (/Ada/i.test(q)) return [{ content: '用户叫 Ada，偏好简体中文' }];
      return [];
    });
    const getContext = vi.fn(() => []);

    // Mirror MnemopiMemory.readMemory query branch without Bun SQLite.
    async function readMemory(recallQuery?: string): Promise<string> {
      if (recallQuery?.trim()) {
        const hits = await recall(recallQuery.trim());
        if (hits.length === 0) return '';
        return hits.map((h) => `- ${h.content}`).join('\n');
      }
      const ctx = getContext() as Array<{ content?: string }>;
      return ctx
        .map((row) => (typeof row?.content === 'string' ? `- ${row.content.trim()}` : ''))
        .filter(Boolean)
        .join('\n');
    }

    const hit = await readMemory('Ada 偏好');
    expect(hit).toContain('Ada');
    expect(hit.length).toBeGreaterThan(0);
    expect(recall).toHaveBeenCalledWith('Ada 偏好');

    const miss = await readMemory('unrelated-xyz');
    expect(miss).toBe('');
  });
});
