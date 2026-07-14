/**
 * Skill 目录（远端市场浏览，不自建市场）
 *
 * 默认源：findscripter/everything-skills（500+ 中文优先，类书式技能大典）
 * 目录索引优先走国内可达 CDN（jsDelivr），避免直连 GitHub raw 超时。
 */

export const DEFAULT_SKILL_CATALOG_SOURCE = 'findscripter/everything-skills';

export type CatalogSkill = {
  name: string;
  /** 卷 / 分类，如「卷〇 · 通用」 */
  category: string;
  categoryId: string;
  description: string;
  /** 安装时传给 installFromSource 的 source */
  source: string;
  path: string;
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
const CACHE_TTL_MS = 30 * 60 * 1000;

function catalogUrls(owner: string, repo: string): string[] {
  // 国内优先：jsDelivr → gitmirror → raw GitHub
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
        description: plugin.description ?? '',
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

/**
 * 拉取技能市场目录（默认 everything-skills）
 */
export async function fetchSkillCatalog(
  source: string = DEFAULT_SKILL_CATALOG_SOURCE,
  options: { force?: boolean } = {},
): Promise<SkillCatalog> {
  const key = source.trim() || DEFAULT_SKILL_CATALOG_SOURCE;
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
