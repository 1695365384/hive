/**
 * Skill catalog 单元测试（mock fetch，不打真实网络）
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SKILL_CATALOG_SOURCE,
  fetchSkillCatalog,
} from '../../src/skill-catalog.js';

describe('skill-catalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('默认源为 findscripter/everything-skills', () => {
    expect(DEFAULT_SKILL_CATALOG_SOURCE).toBe('findscripter/everything-skills');
  });

  it('解析 marketplace.json 为技能目录', async () => {
    const marketplace = {
      name: 'Everything Skills',
      metadata: { description: 'test', version: '1.0.0' },
      plugins: [
        {
          name: 'vol0',
          description: '卷〇 · 通用',
          skills: ['./卷〇/pdf', './卷〇/excel'],
        },
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => marketplace,
      })),
    );

    const catalog = await fetchSkillCatalog('findscripter/everything-skills', {
      force: true,
    });

    expect(catalog.title).toBe('Everything Skills');
    expect(catalog.categories).toHaveLength(1);
    expect(catalog.skills).toHaveLength(2);
    expect(catalog.skills.map((s) => s.name).sort()).toEqual(['excel', 'pdf']);
    expect(catalog.skills[0].source).toBe('findscripter/everything-skills');
  });

  it('非法 source 抛错', async () => {
    await expect(fetchSkillCatalog('not-a-repo', { force: true })).rejects.toThrow(
      /Invalid catalog source/,
    );
  });
});
