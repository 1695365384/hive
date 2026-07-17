/**
 * SkillHandler — 技能管理域
 *
 * skill.list / skill.catalog / skill.install / skill.remove
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_WORKSPACE_DIR, parseFrontmatter } from '@bundy-lmw/hive-core';
import type { HandlerContext, MethodHandler } from '../handler-context.js';
import { WsDomainHandler } from './base.js';
import { createSuccessResponse, createErrorResponse } from '../types.js';
import {
  DEFAULT_SKILL_CATALOG_SOURCE,
  enrichCatalogSkills,
  fetchSkillCatalog,
} from '../../../skill-catalog.js';
import { installFromSource } from '../../../cli/commands/skill/installer.js';
import {
  installFromSkillHub,
  isSkillHubSource,
  SKILLHUB_SOURCE,
} from '../../../skillhub.js';

type InstalledSkillInfo = {
  name: string;
  /** 目录名（SkillHub slug 安装时可能与 name 不同） */
  folder: string;
  aliases: string[];
  description: string;
  version: string;
  scope: 'builtin' | 'user';
};

function builtinDir(): string {
  const envDir = process.env.HIVE_SKILLS_DIR?.trim();
  return envDir
    ? path.resolve(envDir)
    : path.resolve(process.cwd(), DEFAULT_WORKSPACE_DIR, 'skills');
}

function userDir(): string {
  return path.resolve(process.cwd(), DEFAULT_WORKSPACE_DIR, 'skills.local');
}

function readSkillMeta(
  skillDir: string,
  folder: string,
): Omit<InstalledSkillInfo, 'scope'> | null {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;
  try {
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const { metadata } = parseFrontmatter(content);
    const rawMetadata = metadata as unknown as Record<string, unknown>;
    const aliases = new Set<string>([folder]);
    for (const key of ['name', 'slug', 'title', 'displayName'] as const) {
      const value = rawMetadata[key];
      if (typeof value === 'string' && value.trim()) {
        aliases.add(value.trim());
      }
    }

    const metaPath = path.join(skillDir, '_meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
          slug?: unknown;
          name?: unknown;
          displayName?: unknown;
        };
        for (const value of [raw.slug, raw.name, raw.displayName]) {
          if (typeof value === 'string' && value.trim()) {
            aliases.add(value.trim());
          }
        }
      } catch {
        /* ignore malformed package metadata */
      }
    }

    return {
      name: metadata.name || folder,
      folder,
      aliases: [...aliases],
      description: metadata.description,
      version: metadata.version,
    };
  } catch {
    return {
      name: folder,
      folder,
      aliases: [folder],
      description: '',
      version: '0.0.0',
    };
  }
}

function listInstalledIn(dir: string, scope: 'builtin' | 'user'): InstalledSkillInfo[] {
  if (!fs.existsSync(dir)) return [];
  const out: InstalledSkillInfo[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const meta = readSkillMeta(path.join(dir, entry.name), entry.name);
    if (meta) out.push({ ...meta, scope });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function resolveUserSkillDir(nameOrFolder: string): string | null {
  const user = userDir();
  const direct = path.join(user, nameOrFolder);
  const resolvedUser = path.resolve(user);
  const resolvedDirect = path.resolve(direct);
  if (
    resolvedDirect.startsWith(resolvedUser + path.sep) &&
    fs.existsSync(direct)
  ) {
    return direct;
  }

  // 按 frontmatter name 反查目录
  if (!fs.existsSync(user)) return null;
  for (const entry of fs.readdirSync(user, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const meta = readSkillMeta(path.join(user, entry.name), entry.name);
    if (meta && (meta.name === nameOrFolder || meta.aliases.includes(nameOrFolder))) {
      return path.join(user, entry.name);
    }
  }
  return null;
}

export class SkillHandler extends WsDomainHandler {
  register(): Map<string, MethodHandler> {
    return new Map<string, MethodHandler>([
      ['skill.list', this.handleList.bind(this)],
      ['skill.catalog', this.handleCatalog.bind(this)],
      ['skill.catalogEnrich', this.handleCatalogEnrich.bind(this)],
      ['skill.install', this.handleInstall.bind(this)],
      ['skill.remove', this.handleRemove.bind(this)],
    ]);
  }

  private handleList(_params: unknown, id: string) {
    try {
      const items = [
        ...listInstalledIn(builtinDir(), 'builtin'),
        ...listInstalledIn(userDir(), 'user'),
      ];
      return createSuccessResponse(id, items);
    } catch (error) {
      return createErrorResponse(
        id,
        'INTERNAL',
        error instanceof Error ? error.message : 'Failed to list skills',
      );
    }
  }

  private async handleCatalog(params: unknown, id: string) {
    const raw = (params ?? {}) as {
      source?: unknown;
      query?: unknown;
      categoryId?: unknown;
      force?: unknown;
    };
    const source =
      typeof raw.source === 'string' && raw.source.trim()
        ? raw.source.trim()
        : DEFAULT_SKILL_CATALOG_SOURCE;
    // 保留原始大小写：SkillHub 中文搜索依赖原文
    const query = typeof raw.query === 'string' ? raw.query.trim() : '';
    const categoryId =
      typeof raw.categoryId === 'string' && raw.categoryId.trim()
        ? raw.categoryId.trim()
        : '';
    const force = raw.force === true;

    try {
      const catalog = await fetchSkillCatalog(source, {
        force,
        query: query || undefined,
        categoryId: categoryId || undefined,
      });
      return createSuccessResponse(id, {
        ...catalog,
        defaultSource: DEFAULT_SKILL_CATALOG_SOURCE,
      });
    } catch (error) {
      return createErrorResponse(
        id,
        'INTERNAL',
        error instanceof Error ? error.message : 'Failed to load catalog',
      );
    }
  }

  private async handleCatalogEnrich(params: unknown, id: string) {
    const raw = (params ?? {}) as { source?: unknown; paths?: unknown };
    const source =
      typeof raw.source === 'string' && raw.source.trim()
        ? raw.source.trim()
        : DEFAULT_SKILL_CATALOG_SOURCE;
    const paths = Array.isArray(raw.paths)
      ? raw.paths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      : [];

    if (paths.length === 0) {
      return createSuccessResponse(id, { items: [] });
    }
    if (paths.length > 60) {
      return createErrorResponse(id, 'VALIDATION', 'paths limited to 60 per request');
    }

    try {
      const items = await enrichCatalogSkills(source, paths);
      return createSuccessResponse(id, { items });
    } catch (error) {
      return createErrorResponse(
        id,
        'INTERNAL',
        error instanceof Error ? error.message : 'Failed to enrich catalog',
      );
    }
  }

  private async handleInstall(params: unknown, id: string) {
    const raw = (params ?? {}) as { source?: unknown; skills?: unknown; slug?: unknown };
    const source = typeof raw.source === 'string' ? raw.source.trim() : '';
    const slug = typeof raw.slug === 'string' ? raw.slug.trim() : '';
    const skills = Array.isArray(raw.skills)
      ? raw.skills.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : undefined;

    if (!source && !slug) {
      return createErrorResponse(id, 'VALIDATION', 'source or slug is required');
    }

    try {
      let result;

      if (isSkillHubSource(source) || (!source && slug)) {
        const slugs =
          skills && skills.length > 0 ? skills : slug ? [slug] : [];
        if (slugs.length === 0) {
          return createErrorResponse(
            id,
            'VALIDATION',
            'skills or slug is required for SkillHub install',
          );
        }
        const installed: string[] = [];
        const updated: string[] = [];
        const skipped: string[] = [];
        for (const s of slugs) {
          const one = await installFromSkillHub(s, userDir());
          installed.push(...one.installed);
          updated.push(...one.updated);
          skipped.push(...one.skipped);
        }
        result = { installed, updated, skipped };
      } else {
        const { result: githubResult } = await installFromSource(source, {
          skills: skills && skills.length > 0 ? skills : undefined,
          targetDir: userDir(),
        });
        result = githubResult;
      }

      try {
        this.ctx.getServer()?.agent.reloadSkills();
      } catch {
        /* ignore */
      }

      this.ctx.broadcastEvent('skill.installed', {
        source: source || SKILLHUB_SOURCE,
        installed: result.installed,
        updated: result.updated,
        skipped: result.skipped,
      });

      return createSuccessResponse(id, result);
    } catch (error) {
      return createErrorResponse(
        id,
        'INTERNAL',
        error instanceof Error ? error.message : 'Installation failed',
      );
    }
  }

  private handleRemove(params: unknown, id: string) {
    const raw = (params ?? {}) as { name?: unknown };
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) {
      return createErrorResponse(id, 'VALIDATION', 'name is required');
    }

    if (fs.existsSync(path.join(builtinDir(), name))) {
      return createErrorResponse(id, 'VALIDATION', 'Cannot remove built-in skill');
    }

    const dest = resolveUserSkillDir(name);
    if (!dest) {
      return createErrorResponse(id, 'NOT_FOUND', `Skill not found: ${name}`);
    }

    try {
      const folder = path.basename(dest);
      fs.rmSync(dest, { recursive: true, force: true });
      try {
        this.ctx.getServer()?.agent.reloadSkills();
      } catch {
        /* ignore */
      }
      this.ctx.broadcastEvent('skill.removed', { name: folder });
      return createSuccessResponse(id, { name: folder });
    } catch (error) {
      return createErrorResponse(
        id,
        'INTERNAL',
        error instanceof Error ? error.message : 'Remove failed',
      );
    }
  }
}
