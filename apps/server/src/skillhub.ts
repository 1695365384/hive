/**
 * 腾讯 SkillHub（国内技能商店）HTTP 客户端
 *
 * 匿名可搜索 / 浏览热榜 / 下载安装，无需 API Key。
 * https://skillhub.cn
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import {
  discoverSkills,
  type InstallResult,
} from './cli/commands/skill/installer.js';

export const SKILLHUB_SOURCE = 'skillhub';
export const SKILLHUB_API_HOST = 'https://api.skillhub.cn';
export const SKILLHUB_DOWNLOAD_URL = `${SKILLHUB_API_HOST}/api/v1/download?slug={slug}`;
export const SKILLHUB_COS_DOWNLOAD_URL =
  'https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/skills/{slug}.zip';

const UA = 'hive-server/skillhub';

export type SkillHubSkill = {
  slug: string;
  name: string;
  title: string;
  description: string;
  category: string;
  categoryId: string;
  version?: string;
  downloads?: number;
  iconUrl?: string;
};

export type SkillHubCategory = {
  id: string;
  label: string;
  count: number;
};

type RawSearchItem = {
  slug?: string;
  name?: string;
  displayName?: string;
  description?: string;
  description_zh?: string;
  summary?: string;
  category?: string;
  version?: string;
  downloads?: number;
  icon_url?: string;
  iconUrl?: string;
};

type RawRankingItem = {
  slug?: string;
  name?: string;
  description?: string;
  description_zh?: string;
  category?: string;
  version?: string;
  downloads?: number;
  iconUrl?: string;
  icon_url?: string;
};

function fillSlug(template: string, slug: string): string {
  return template.replaceAll('{slug}', encodeURIComponent(slug));
}

async function fetchJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

function pickDescription(item: {
  description_zh?: string;
  description?: string;
  summary?: string;
}): string {
  const zh = item.description_zh?.trim();
  if (zh) return zh;
  const en = item.description?.trim();
  if (en) {
    // SkillHub 常把中英叠在一起，优先取含中文的一段
    const parts = en.split('\n').map((s) => s.trim()).filter(Boolean);
    const cn = parts.find((p) => /[\u4e00-\u9fff]/.test(p));
    return cn ?? parts[0] ?? en;
  }
  return item.summary?.trim() ?? '';
}

function normalizeSearchItem(item: RawSearchItem): SkillHubSkill | null {
  const slug = item.slug?.trim();
  if (!slug) return null;
  const title = (item.displayName || item.name || slug).trim();
  const categoryId = (item.category || 'other').trim();
  return {
    slug,
    name: slug,
    title,
    description: pickDescription(item),
    category: categoryId,
    categoryId,
    version: item.version,
    downloads: item.downloads,
    iconUrl: item.iconUrl || item.icon_url,
  };
}

function normalizeRankingItem(item: RawRankingItem): SkillHubSkill | null {
  const slug = item.slug?.trim();
  if (!slug) return null;
  const title = (item.name || slug).trim();
  const categoryId = (item.category || 'other').trim();
  return {
    slug,
    name: slug,
    title,
    description: pickDescription(item),
    category: categoryId,
    categoryId,
    version: item.version,
    downloads: item.downloads,
    iconUrl: item.iconUrl || item.icon_url,
  };
}

/** 热榜 / 推荐等 showcase 列表（默认浏览） */
export async function fetchSkillHubShowcase(
  type: 'hot' | 'featured' | 'newest' | 'recommended' | 'trending' = 'hot',
): Promise<SkillHubSkill[]> {
  const data = await fetchJson<{ skills?: RawRankingItem[] }>(
    `${SKILLHUB_API_HOST}/api/v1/showcase/${type}`,
  );
  return (data.skills ?? [])
    .map(normalizeRankingItem)
    .filter((s): s is SkillHubSkill => s !== null);
}

/** 关键词搜索（国内 API，匿名） */
export async function searchSkillHub(
  query: string,
  options: { limit?: number; categoryId?: string } = {},
): Promise<SkillHubSkill[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = Math.max(1, Math.min(options.limit ?? 40, 100));
  const params = new URLSearchParams({
    q,
    limit: String(limit),
  });
  if (options.categoryId?.trim()) {
    params.set('category', options.categoryId.trim());
  }
  const data = await fetchJson<{ results?: RawSearchItem[] }>(
    `${SKILLHUB_API_HOST}/api/v1/search?${params}`,
  );
  return (data.results ?? [])
    .map(normalizeSearchItem)
    .filter((s): s is SkillHubSkill => s !== null);
}

/** 官方分类（中文名） */
export async function fetchSkillHubCategories(): Promise<SkillHubCategory[]> {
  const data = await fetchJson<{
    items?: Array<{ key?: string; name?: string; nameEn?: string; active?: boolean }>;
  }>(`${SKILLHUB_API_HOST}/api/v1/categories`);

  return (data.items ?? [])
    .filter((c) => c.active !== false && c.key)
    .map((c) => ({
      id: c.key!.trim(),
      label: (c.name || c.nameEn || c.key!).trim(),
      count: 0,
    }));
}

async function downloadZip(slug: string, destFile: string): Promise<void> {
  const urls = [
    fillSlug(SKILLHUB_DOWNLOAD_URL, slug),
    fillSlug(SKILLHUB_COS_DOWNLOAD_URL, slug),
  ];
  const errors: string[] = [];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(60_000),
        headers: { 'User-Agent': UA, Accept: 'application/zip,*/*' },
        redirect: 'follow',
      });
      if (!res.ok) {
        errors.push(`${url}: HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
        errors.push(`${url}: not a zip`);
        continue;
      }
      fs.writeFileSync(destFile, buf);
      return;
    } catch (err) {
      errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`Failed to download skill "${slug}" from SkillHub.\n${errors.join('\n')}`);
}

function unzipTo(zipFile: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  try {
    execFileSync('unzip', ['-o', '-q', zipFile, '-d', destDir], {
      stdio: 'pipe',
      timeout: 60_000,
    });
    return;
  } catch {
    /* try ditto on macOS */
  }
  try {
    execFileSync('ditto', ['-x', '-k', zipFile, destDir], {
      stdio: 'pipe',
      timeout: 60_000,
    });
    return;
  } catch (err) {
    throw new Error(
      `Failed to unzip skill archive (need unzip or ditto).\n${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

function assertChildPath(parentDir: string, childPath: string): void {
  const parent = path.resolve(parentDir);
  const child = path.resolve(childPath);
  if (child !== parent && !child.startsWith(parent + path.sep)) {
    throw new Error('Invalid install path');
  }
}

function findExistingSkillHubInstall(targetDir: string, slug: string): string | null {
  if (!fs.existsSync(targetDir)) return null;
  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === slug) return path.join(targetDir, entry.name);
    const metaPath = path.join(targetDir, entry.name, '_meta.json');
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { slug?: unknown };
      if (meta.slug === slug) return path.join(targetDir, entry.name);
    } catch {
      /* ignore */
    }
  }
  return null;
}

function installSkillHubDir(sourceDir: string, targetDir: string, slug: string): InstallResult {
  const dest = path.join(targetDir, slug);
  assertChildPath(targetDir, dest);

  const existing = findExistingSkillHubInstall(targetDir, slug);
  const existed = existing !== null;

  fs.mkdirSync(targetDir, { recursive: true });
  if (existing && path.resolve(existing) !== path.resolve(dest)) {
    fs.rmSync(existing, { recursive: true, force: true });
  }
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.cpSync(sourceDir, dest, { recursive: true });

  return {
    installed: existed ? [] : [slug],
    updated: existed ? [slug] : [],
    skipped: [],
  };
}

/**
 * 从 SkillHub 按 slug 安装到目标目录（通常 .hive/skills.local）
 */
export async function installFromSkillHub(
  slug: string,
  targetDir: string,
): Promise<InstallResult> {
  const cleaned = slug.trim();
  if (!cleaned || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(cleaned)) {
    throw new Error(`Invalid SkillHub slug: "${slug}"`);
  }

  const tempRoot = path.join(tmpdir(), `hive-skillhub-${randomBytes(8).toString('hex')}`);
  const zipFile = path.join(tempRoot, `${cleaned}.zip`);
  const extractDir = path.join(tempRoot, 'extract');

  try {
    fs.mkdirSync(tempRoot, { recursive: true });
    await downloadZip(cleaned, zipFile);
    unzipTo(zipFile, extractDir);

    const discovered = discoverSkills(extractDir);
    if (discovered.length === 0) {
      // 扁平 zip：根目录即技能
      const skillMd = path.join(extractDir, 'SKILL.md');
      if (!fs.existsSync(skillMd)) {
        throw new Error(`No SKILL.md found in SkillHub package "${cleaned}"`);
      }
      return installSkillHubDir(extractDir, targetDir, cleaned);
    }

    // SkillHub 商店以 slug 识别安装状态，即使包内 SKILL.md 的 name 不同也按 slug 落盘。
    const exact = discovered.find((d) => d.name === cleaned);
    const selected = exact ?? discovered[0];
    return installSkillHubDir(selected.sourceDir, targetDir, cleaned);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function isSkillHubSource(source: string | undefined | null): boolean {
  const s = (source ?? '').trim().toLowerCase();
  return !s || s === SKILLHUB_SOURCE || s === 'skillhub.cn' || s === 'tencent-skillhub';
}
