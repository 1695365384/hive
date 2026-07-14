import { describe, it, expect } from 'vitest';
import { extractExpectedSlideCount } from '../../../src/agents/completion/office-slide-count.js';

describe('office-slide-count', () => {
  it('extractExpectedSlideCount parses Chinese 页', () => {
    expect(extractExpectedSlideCount('帮我做 8 页 PPT')).toBe(8);
    expect(extractExpectedSlideCount('8页汇报')).toBe(8);
  });

  it('extractExpectedSlideCount parses English slides', () => {
    expect(extractExpectedSlideCount('Create an 8-slide deck')).toBe(8);
  });

  it('extractExpectedSlideCount returns null when unspecified', () => {
    expect(extractExpectedSlideCount('做一个项目汇报 PPT')).toBeNull();
  });
});
