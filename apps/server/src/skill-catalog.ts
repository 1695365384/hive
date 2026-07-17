/**
 * Skill 目录（远端市场浏览）
 *
 * 默认源：腾讯 SkillHub（国内商店，匿名 search / showcase / download）
 * 仍兼容 owner/repo（GitHub marketplace.json）作为可选源。
 */

import {
  SKILLHUB_SOURCE,
  fetchSkillHubCategories,
  fetchSkillHubShowcase,
  isSkillHubSource,
  searchSkillHub,
  type SkillHubSkill,
} from './skillhub.js';

export const DEFAULT_SKILL_CATALOG_SOURCE = SKILLHUB_SOURCE;

export type CatalogSkill = {
  name: string;
  /** 分类展示名 */
  category: string;
  categoryId: string;
  /** 技能级简介 */
  description: string;
  /** 展示标题（中文名等） */
  title?: string;
  /** 安装源：skillhub 或 owner/repo */
  source: string;
  /** skillhub 时为 slug；GitHub 源时为仓库内路径 */
  path: string;
  version?: string;
  downloads?: number;
  iconUrl?: string;
};

export type CatalogSkillEnrichment = {
  path: string;
  title?: string;
  description?: string;
  name?: string;
};

export type CatalogCategory = {
  id: string;
  label: string;
  count: number;
};

export type SkillCatalog = {
  source: string;
  title: string;
  description: string;
  version?: string;
  categories: CatalogCategory[];
  skills: CatalogSkill[];
  fetchedAt: number;
};

type MarketplacePlugin = {
  name: string;
  description?: string;
  skills?: string[];
};

type MarketplaceJson = {
  name?: string;
  metadata?: { description?: string; version?: string };
  plugins?: MarketplacePlugin[];
};

const catalogCache = new Map<string, { expires: number; data: SkillCatalog }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CATEGORY_LABEL_CACHE_TTL_MS = 60 * 60 * 1000;
let categoryLabelCache: { expires: number; map: Map<string, string>; list: CatalogCategory[] } | null =
  null;

function catalogUrls(owner: string, repo: string): string[] {
  return [
    `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/.claude-plugin/marketplace.json`,
    `https://cdn.jsdelivr.net/gh/${owner}/${repo}@master/.claude-plugin/marketplace.json`,
    `https://raw.gitmirror.com/${owner}/${repo}/main/.claude-plugin/marketplace.json`,
    `https://raw.githubusercontent.com/${owner}/${repo}/main/.claude-plugin/marketplace.json`,
  ];
}

function parseOwnerRepo(source: string): { owner: string; repo: string } {
  const m = source.trim().match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (!m) {
    throw new Error(`Invalid catalog source "${source}". Use owner/repo form.`);
  }
  return { owner: m[1], repo: m[2] };
}

async function fetchJson(url: string): Promise<MarketplaceJson> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as MarketplaceJson;
}

function buildCatalog(source: string, json: MarketplaceJson): SkillCatalog {
  const skills: CatalogSkill[] = [];
  const categories: CatalogCategory[] = [];

  for (const plugin of json.plugins ?? []) {
    const paths = plugin.skills ?? [];
    categories.push({
      id: plugin.name,
      label: plugin.description ?? plugin.name,
      count: paths.length,
    });

    for (const rel of paths) {
      const cleaned = rel.replace(/^\.\//, '');
      const name = cleaned.split('/').filter(Boolean).pop();
      if (!name) continue;
      skills.push({
        name,
        category: plugin.description ?? plugin.name,
        categoryId: plugin.name,
        description: '',
        source,
        path: cleaned,
      });
    }
  }

  return {
    source,
    title: json.name ?? source,
    description: json.metadata?.description ?? '',
    version: json.metadata?.version,
    categories,
    skills,
    fetchedAt: Date.now(),
  };
}

async function loadCategoryLabels(): Promise<{
  map: Map<string, string>;
  list: CatalogCategory[];
}> {
  if (categoryLabelCache && categoryLabelCache.expires > Date.now()) {
    return { map: categoryLabelCache.map, list: categoryLabelCache.list };
  }
  try {
    const list = await fetchSkillHubCategories();
    const map = new Map(list.map((c) => [c.id, c.label]));
    categoryLabelCache = {
      expires: Date.now() + CATEGORY_LABEL_CACHE_TTL_MS,
      map,
      list,
    };
    return { map, list };
  } catch {
    return { map: new Map(), list: [] };
  }
}

function toCatalogSkill(item: SkillHubSkill, labelMap: Map<string, string>): CatalogSkill {
  const label = labelMap.get(item.categoryId) ?? item.category;
  return {
    name: item.slug,
    title: item.title,
    category: label,
    categoryId: item.categoryId,
    description: item.description,
    source: SKILLHUB_SOURCE,
    path: item.slug,
    version: item.version,
    downloads: item.downloads,
    iconUrl: item.iconUrl,
  };
}

async function fetchSkillHubCatalog(options: {
  query?: string;
  categoryId?: string;
  force?: boolean;
}): Promise<SkillCatalog> {
  const query = options.query?.trim() ?? '';
  const categoryId = options.categoryId?.trim() ?? '';
  const cacheKey = `skillhub:${query}:${categoryId}`;

  if (!options.force) {
    const cached = catalogCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
  }

  const { map: labelMap, list: categoryList } = await loadCategoryLabels();

  let skills: CatalogSkill[];
  if (query) {
    const results = await searchSkillHub(query, {
      limit: 60,
      categoryId: categoryId || undefined,
    });
    skills = results.map((s) => toCatalogSkill(s, labelMap));
  } else if (categoryId) {
    // 无关键词时用分类中文名检索，再按 categoryId 收紧
    const label = labelMap.get(categoryId) ?? categoryId;
    const results = await searchSkillHub(label, { limit: 60, categoryId });
    skills = results
      .map((s) => toCatalogSkill(s, labelMap))
      .filter((s) => s.categoryId === categoryId);
    if (skills.length === 0) {
      const hot = await fetchSkillHubShowcase('hot');
      skills = hot
        .map((s) => toCatalogSkill(s, labelMap))
        .filter((s) => s.categoryId === categoryId);
    }
  } else {
    const hot = await fetchSkillHubShowcase('hot');
    skills = hot.map((s) => toCatalogSkill(s, labelMap));
  }

  // 分类计数：有搜索结果时按结果统计；默认浏览用官方分类列表
  const countMap = new Map<string, number>();
  for (const s of skills) {
    countMap.set(s.categoryId, (countMap.get(s.categoryId) ?? 0) + 1);
  }
  const categories: CatalogCategory[] =
    categoryList.length > 0
      ? categoryList.map((c) => ({
          ...c,
          count: countMap.get(c.id) ?? 0,
        }))
      : [...countMap.entries()].map(([id, count]) => ({
          id,
          label: labelMap.get(id) ?? id,
          count,
        }));

  const data: SkillCatalog = {
    source: SKILLHUB_SOURCE,
    title: 'SkillHub',
    description: '腾讯云 SkillHub 国内技能商店（匿名浏览/安装）',
    categories,
    skills,
    fetchedAt: Date.now(),
  };
  catalogCache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL_MS });
  return data;
}

async function fetchGithubCatalog(
  source: string,
  options: { force?: boolean } = {},
): Promise<SkillCatalog> {
  const key = source.trim();
  const cached = catalogCache.get(key);
  if (!options.force && cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const { owner, repo } = parseOwnerRepo(key);
  const errors: string[] = [];

  for (const url of catalogUrls(owner, repo)) {
    try {
      const json = await fetchJson(url);
      if (!json.plugins?.length) {
        errors.push(`${url}: empty plugins`);
        continue;
      }
      const data = buildCatalog(key, json);
      catalogCache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
      return data;
    } catch (err) {
      errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(
    `Failed to fetch skill catalog for "${key}". Tried CDN mirrors.\n${errors.join('\n')}`,
  );
}

/**
 * 拉取技能市场目录（默认 SkillHub）
 */
export async function fetchSkillCatalog(
  source: string = DEFAULT_SKILL_CATALOG_SOURCE,
  options: { force?: boolean; query?: string; categoryId?: string } = {},
): Promise<SkillCatalog> {
  const key = source.trim() || DEFAULT_SKILL_CATALOG_SOURCE;

  if (isSkillHubSource(key)) {
    return fetchSkillHubCatalog({
      query: options.query,
      categoryId: options.categoryId,
      force: options.force,
    });
  }

  const catalog = await fetchGithubCatalog(key, { force: options.force });
  let skills = catalog.skills;
  if (options.categoryId?.trim()) {
    skills = skills.filter((s) => s.categoryId === options.categoryId!.trim());
  }
  if (options.query?.trim()) {
    const q = options.query.trim().toLowerCase();
    skills = skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        (s.title?.toLowerCase().includes(q) ?? false),
    );
  }
  return { ...catalog, skills };
}

function skillMdUrls(owner: string, repo: string, skillPath: string): string[] {
  const cleaned = skillPath.replace(/^\.\//, '').replace(/\/$/, '');
  const rel = `${cleaned}/SKILL.md`;
  return [
    `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/${rel}`,
    `https://cdn.jsdelivr.net/gh/${owner}/${repo}@master/${rel}`,
    `https://raw.gitmirror.com/${owner}/${repo}/main/${rel}`,
    `https://raw.githubusercontent.com/${owner}/${repo}/main/${rel}`,
  ];
}

/** 轻量 frontmatter：只取 name/title/description，不走完整 Skill 校验 */
export function parseSkillPreviewFrontmatter(content: string): {
  name?: string;
  title?: string;
  description?: string;
} {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const block = match[1];
  const out: { name?: string; title?: string; description?: string } = {};
  for (const key of ['name', 'title', 'description'] as const) {
    const re = new RegExp(`^${key}:\\s*(.*)$`, 'm');
    const m = block.match(re);
    if (!m) continue;
    let value = m[1].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value && value !== '|' && value !== '>') {
      out[key] = value;
    }
  }
  return out;
}

const enrichCache = new Map<string, CatalogSkillEnrichment>();

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'text/plain,*/*' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function enrichOne(
  owner: string,
  repo: string,
  skillPath: string,
): Promise<CatalogSkillEnrichment> {
  const cacheKey = `${owner}/${repo}:${skillPath}`;
  const hit = enrichCache.get(cacheKey);
  if (hit) return hit;

  const empty: CatalogSkillEnrichment = { path: skillPath };
  for (const url of skillMdUrls(owner, repo, skillPath)) {
    try {
      const text = await fetchText(url);
      const meta = parseSkillPreviewFrontmatter(text);
      const result: CatalogSkillEnrichment = {
        path: skillPath,
        title: meta.title,
        description: meta.description,
        name: meta.name,
      };
      enrichCache.set(cacheKey, result);
      return result;
    } catch {
      /* try next mirror */
    }
  }
  enrichCache.set(cacheKey, empty);
  return empty;
}

/**
 * 批量拉取 SKILL.md 简介（仅 GitHub 源需要；SkillHub 已自带描述）
 */
export async function enrichCatalogSkills(
  source: string,
  paths: string[],
  options: { concurrency?: number } = {},
): Promise<CatalogSkillEnrichment[]> {
  if (isSkillHubSource(source)) {
    return paths.map((p) => ({ path: p }));
  }

  const { owner, repo } = parseOwnerRepo(source.trim() || 'findscripter/everything-skills');
  const unique = [
    ...new Set(paths.map((p) => p.replace(/^\.\//, '').replace(/\/$/, '')).filter(Boolean)),
  ];
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 8, 16));
  const results: CatalogSkillEnrichment[] = [];

  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const part = await Promise.all(batch.map((p) => enrichOne(owner, repo, p)));
    results.push(...part);
  }
  return results;
}
