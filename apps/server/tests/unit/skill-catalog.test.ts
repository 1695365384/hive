/**
 * Skill catalog 单元测试（mock fetch，不打真实网络）
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SKILL_CATALOG_SOURCE,
  fetchSkillCatalog,
} from '../../src/skill-catalog.js';
import { SKILLHUB_SOURCE } from '../../src/skillhub.js';

describe('skill-catalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('默认源为 skillhub', () => {
    expect(DEFAULT_SKILL_CATALOG_SOURCE).toBe(SKILLHUB_SOURCE);
    expect(DEFAULT_SKILL_CATALOG_SOURCE).toBe('skillhub');
  });

  it('SkillHub 热榜目录带中文简介', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/categories')) {
          return {
            ok: true,
            json: async () => ({
              items: [
                {
                  key: 'ai-agent',
                  name: 'AI Agent',
                  active: true,
                },
              ],
            }),
          };
        }
        if (url.includes('/api/v1/showcase/hot')) {
          return {
            ok: true,
            json: async () => ({
              section: 'hot_downloads',
              skills: [
                {
                  slug: 'self-improving-agent',
                  name: 'self-improving agent',
                  description_zh: '记录自身发现以实现自我改进的技能',
                  description: 'A skill where the agent logs findings',
                  category: 'ai-agent',
                  version: '3.0.24',
                  downloads: 100,
                },
              ],
            }),
          };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const catalog = await fetchSkillCatalog('skillhub', { force: true });
    expect(catalog.title).toBe('SkillHub');
    expect(catalog.skills).toHaveLength(1);
    expect(catalog.skills[0].name).toBe('self-improving-agent');
    expect(catalog.skills[0].title).toBe('self-improving agent');
    expect(catalog.skills[0].description).toContain('自我改进');
    expect(catalog.skills[0].source).toBe('skillhub');
    expect(catalog.skills[0].category).toBe('AI Agent');
  });

  it('SkillHub 搜索走 search API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/categories')) {
          return { ok: true, json: async () => ({ items: [] }) };
        }
        if (url.includes('/api/v1/search')) {
          expect(url).toContain('q=%E9%A3%9E%E4%B9%A6');
          return {
            ok: true,
            json: async () => ({
              results: [
                {
                  slug: 'feishu',
                  displayName: 'Feishu',
                  description_zh: '飞书深度集成',
                  category: 'office-efficiency',
                  version: '1.0.5',
                },
              ],
            }),
          };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const catalog = await fetchSkillCatalog('skillhub', {
      force: true,
      query: '飞书',
    });
    expect(catalog.skills).toHaveLength(1);
    expect(catalog.skills[0].path).toBe('feishu');
    expect(catalog.skills[0].description).toBe('飞书深度集成');
  });

  it('仍支持 GitHub marketplace 源', async () => {
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

  it('非法 GitHub source 抛错', async () => {
    await expect(fetchSkillCatalog('not-a-repo', { force: true })).rejects.toThrow(
      /Invalid catalog source/,
    );
  });
});
