import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  countPptxSlides,
  extractExpectedSlideCount,
  inspectPptxZip,
} from '../../../src/agents/completion/office-slide-count.js';
import { buildPptxFixture } from './pptx-fixture.js';

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

  describe('inspect / count', () => {
    let root = '';
    let deck = '';

    beforeAll(async () => {
      root = join(tmpdir(), `hive-slide-count-${Date.now()}`);
      await mkdir(root, { recursive: true });
      deck = await buildPptxFixture(root, 'deck', { slides: 3, media: true });
    });

    afterAll(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it('inspectPptxZip returns slide count and media', async () => {
      const info = await inspectPptxZip(deck);
      expect(info.ok).toBe(true);
      expect(info.slideCount).toBe(3);
      expect(info.hasMedia).toBe(true);
    });

    it('countPptxSlides wraps inspect', async () => {
      expect(await countPptxSlides(deck)).toBe(3);
      const junk = join(root, 'bad.pptx');
      await writeFile(junk, 'x');
      expect(await countPptxSlides(junk)).toBeNull();
    });
  });
});
