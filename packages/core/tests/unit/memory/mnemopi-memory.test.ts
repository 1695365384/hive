/**
 * MnemopiMemory — helpers always; live SQLite only under Bun smoke (not vitest).
 *
 * Full FTS round-trip is covered by `scripts/smoke-mnemopi.mjs` (Bun).
 */

import { describe, it, expect } from 'vitest';
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
