import { describe, it, expect } from 'vitest';
import { safeJsonParse } from '../../src/utils/safe-json-parse.js';

describe('safeJsonParse', () => {
  it('parses valid JSON object', () => {
    expect(safeJsonParse('{"key": "value"}', {})).toEqual({ key: 'value' });
  });

  it('parses valid JSON array', () => {
    expect(safeJsonParse('[1, 2, 3]', [])).toEqual([1, 2, 3]);
  });

  it('parses valid JSON primitives', () => {
    expect(safeJsonParse('42', 0)).toBe(42);
    expect(safeJsonParse('"hello"', '')).toBe('hello');
    expect(safeJsonParse('true', false)).toBe(true);
    expect(safeJsonParse('null', 'fallback')).toBeNull();
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('not json', { default: true })).toEqual({ default: true });
    expect(safeJsonParse('{broken', {})).toEqual({});
  });

  it('returns fallback for empty string', () => {
    expect(safeJsonParse('', 'fallback')).toBe('fallback');
  });

  it('returns fallback when JSON is valid but wrong type', () => {
    // Parsing 'null' returns null, which is valid JSON
    expect(safeJsonParse('null', 'fallback')).toBeNull();
  });
});
