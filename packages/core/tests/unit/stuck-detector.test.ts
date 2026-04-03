import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isEmptyResult, createStuckDetector, getResultFingerprint } from '../../src/tools/built-in/agent-tool.js';

// ============================================
// isEmptyResult
// ============================================

describe('isEmptyResult', () => {
  it('returns true for empty string', () => {
    expect(isEmptyResult('')).toBe(true);
    expect(isEmptyResult('   ')).toBe(true);
  });

  it('returns true for "No ... found" patterns', () => {
    expect(isEmptyResult('No search results found for "test"')).toBe(true);
    expect(isEmptyResult('No results')).toBe(true);
    expect(isEmptyResult('No matches found')).toBe(true);
    expect(isEmptyResult('No files found')).toBe(true);
    expect(isEmptyResult('0 results found')).toBe(true);
  });

  it('returns true for "[empty]" pattern', () => {
    expect(isEmptyResult('[empty]')).toBe(true);
    expect(isEmptyResult('[Empty]')).toBe(true);
  });

  it('returns false for normal output', () => {
    expect(isEmptyResult('Found 5 results')).toBe(false);
    expect(isEmptyResult('Here is some data')).toBe(false);
  });

  it('returns false for long output even if it starts with "No"', () => {
    const longOutput = 'No results found for "test" but then a very long description that exceeds 200 characters'.padEnd(201, 'x');
    expect(isEmptyResult(longOutput)).toBe(false);
  });
});

// ============================================
// getResultFingerprint
// ============================================

describe('getResultFingerprint', () => {
  it('includes tool name', () => {
    expect(getResultFingerprint('web-search', 'some output')).toMatch(/^web-search:/);
  });

  it('normalizes dates', () => {
    const fp1 = getResultFingerprint('web-search', 'No results found on 2025-04-03');
    const fp2 = getResultFingerprint('web-search', 'No results found on 2026-01-15');
    expect(fp1).toBe(fp2);
  });

  it('normalizes IPs', () => {
    const fp1 = getResultFingerprint('bash', 'Error from 192.168.1.1');
    const fp2 = getResultFingerprint('bash', 'Error from 10.0.0.5');
    expect(fp1).toBe(fp2);
  });

  it('produces different fingerprints for different tools', () => {
    const fp1 = getResultFingerprint('web-search', 'No results');
    const fp2 = getResultFingerprint('grep', 'No results');
    expect(fp1).not.toBe(fp2);
  });
});

// ============================================
// createStuckDetector
// ============================================

describe('createStuckDetector', () => {
  function createMockAbortController() {
    const controller: { signal: { aborted: boolean } } = { signal: { aborted: false } };
    return {
      ...controller,
      abort: () => { controller.signal.aborted = true; },
      addEventListener: () => {},
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns no warning for first empty result', () => {
    const ac = createMockAbortController();
    const detector = createStuckDetector(ac as any);
    const result = detector.recordResult('web-search', 'No results found');
    expect(result.stuck).toBe(false);
    expect(result.warning).toBeNull();
  });

  it('returns warning at 3rd consecutive empty result', () => {
    const ac = createMockAbortController();
    const detector = createStuckDetector(ac as any);

    detector.recordResult('web-search', 'No results found');
    detector.recordResult('web-search', 'No results found');
    const result = detector.recordResult('web-search', 'No results found');

    expect(result.stuck).toBe(true);
    expect(result.warning).toContain('WARNING');
    expect(result.warning).toContain('web-search');
    expect(result.warning).toContain('3');
  });

  it('only warns once for same streak', () => {
    const ac = createMockAbortController();
    const detector = createStuckDetector(ac as any);

    detector.recordResult('web-search', 'No results found');
    detector.recordResult('web-search', 'No results found');
    detector.recordResult('web-search', 'No results found'); // warns
    const result = detector.recordResult('web-search', 'No results found'); // no re-warn

    expect(result.warning).toBeNull();
  });

  it('aborts at 5th consecutive empty result', () => {
    const ac = createMockAbortController();
    const detector = createStuckDetector(ac as any);

    detector.recordResult('web-search', 'No results found');
    detector.recordResult('web-search', 'No results found');
    detector.recordResult('web-search', 'No results found');
    detector.recordResult('web-search', 'No results found');
    const result = detector.recordResult('web-search', 'No results found');

    expect(result.stuck).toBe(true);
    expect(result.warning).toContain('STOP');
    expect(ac.signal.aborted).toBe(true);
  });

  it('resets counter when a non-empty result appears', () => {
    const ac = createMockAbortController();
    const detector = createStuckDetector(ac as any);

    detector.recordResult('web-search', 'No results found');
    detector.recordResult('web-search', 'No results found');
    detector.recordResult('web-search', 'Found 5 articles'); // non-empty, reset
    const result = detector.recordResult('web-search', 'No results found');

    expect(result.stuck).toBe(false);
    expect(result.warning).toBeNull();
    expect(ac.signal.aborted).toBe(false);
  });

  it('resets counter when a different fingerprint appears', () => {
    const ac = createMockAbortController();
    const detector = createStuckDetector(ac as any);

    detector.recordResult('web-search', 'No results found');
    detector.recordResult('web-search', 'No results found');
    detector.recordResult('web-search', 'No results for "different query"'); // different fp, reset
    const result = detector.recordResult('web-search', 'No results for "different query"');

    expect(result.stuck).toBe(false);
    expect(result.warning).toBeNull();
  });

  it('treats empty string as empty result', () => {
    const ac = createMockAbortController();
    const detector = createStuckDetector(ac as any);

    detector.recordResult('bash', '');
    detector.recordResult('bash', '');
    const result = detector.recordResult('bash', ''); // 3rd → triggers WARNING

    expect(result.stuck).toBe(true);
    expect(result.warning).toContain('WARNING');
  });

  it('resets on reset() call', () => {
    const ac = createMockAbortController();
    const detector = createStuckDetector(ac as any);

    detector.recordResult('web-search', 'No results found');
    detector.recordResult('web-search', 'No results found');
    detector.reset();
    const result = detector.recordResult('web-search', 'No results found');

    expect(result.stuck).toBe(false);
  });
});
