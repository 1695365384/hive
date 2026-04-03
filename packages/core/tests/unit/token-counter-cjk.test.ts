/**
 * P0.2: CJK-aware Token 计数测试
 */

import { describe, it, expect } from 'vitest';
import { SimpleTokenCounter, createTokenCounter } from '../../src/compression/TokenCounter.js';

describe('SimpleTokenCounter — CJK-aware', () => {
  const counter = new SimpleTokenCounter();

  it('returns 0 for empty string', () => {
    expect(counter.count('')).toBe(0);
  });

  it('estimates ASCII tokens (chars/4 * safety)', () => {
    // 40 ASCII chars → 40 * 0.25 * 1.1 ≈ 11 tokens
    const tokens = counter.count('a'.repeat(40));
    expect(tokens).toBeGreaterThan(8);
    expect(tokens).toBeLessThan(15);
  });

  it('estimates more tokens per char for CJK text', () => {
    // 10 CJK chars → 10 * 1.3 * 1.1 ≈ 14.3 tokens
    const cjkTokens = counter.count('你好世界测试中文数据');
    // 40 ASCII chars → ~11 tokens
    const asciiTokens = counter.count('a'.repeat(40));
    // 10 CJK chars should produce more tokens than 40 ASCII chars (char-for-char comparison)
    // CJK: 10 chars → ~14; ASCII: 10 chars → ~3
    const cjkTenChars = counter.count('你好世界测试中文数据'); // 10 chars
    const asciiTenChars = counter.count('a'.repeat(10));       // 10 chars
    expect(cjkTenChars).toBeGreaterThan(asciiTenChars);
  });

  it('mixed Chinese + English produces intermediate token count', () => {
    // Half CJK, half ASCII — should be between pure-CJK and pure-ASCII counts
    const mixed = '你好hello'; // 2 CJK + 5 ASCII = 7 chars
    const mixedTokens = counter.count(mixed);
    const pureAscii = counter.count('a'.repeat(7));
    // Mixed should have more tokens than pure ASCII of same length
    expect(mixedTokens).toBeGreaterThan(pureAscii);
  });

  it('Japanese hiragana/katakana counted as CJK', () => {
    const jp = 'こんにちは'; // 5 hiragana chars
    const ascii = 'a'.repeat(5);
    expect(counter.count(jp)).toBeGreaterThan(counter.count(ascii));
  });

  it('countMessage adds overhead for role and format', () => {
    const msg = { id: '1', role: 'user' as const, content: 'Hello', timestamp: new Date() };
    const contentOnly = counter.count('Hello');
    const withOverhead = counter.countMessage(msg);
    expect(withOverhead).toBeGreaterThan(contentOnly);
  });

  it('countMessages returns 0 for empty array', () => {
    expect(counter.countMessages([])).toBe(0);
  });

  it('createTokenCounter factory produces working counter', () => {
    const tc = createTokenCounter();
    expect(tc.count('test')).toBeGreaterThan(0);
  });
});
