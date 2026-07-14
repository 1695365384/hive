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
  fetchSkillCatalog,
} from '../../../skill-catalog.js';
import { installFromSource } from '../../../cli/commands/skill/installer.js';

type InstalledSkillInfo = {
  name: string;
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

function readSkillMeta(skillDir: string): Omit<InstalledSkillInfo, 'scope'> | null {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;
  try {
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const { metadata } = parseFrontmatter(content);
    return {
      name: metadata.name,
      description: metadata.description,
      version: metadata.version,
    };
  } catch {
    return {
      name: path.basename(skillDir),
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
    const meta = readSkillMeta(path.join(dir, entry.name));
    if (meta) out.push({ ...meta, scope });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export class SkillHandler extends WsDomainHandler {
  register(): Map<string, MethodHandler> {
    return new Map<string, MethodHandler>([
      ['skill.list', this.handleList.bind(this)],
      ['skill.catalog', this.handleCatalog.bind(this)],
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
    const query = typeof raw.query === 'string' ? raw.query.trim().toLowerCase() : '';
    const categoryId =
      typeof raw.categoryId === 'string' && raw.categoryId.trim()
        ? raw.categoryId.trim()
        : '';
    const force = raw.force === true;

    try {
      const catalog = await fetchSkillCatalog(source, { force });
      let skills = catalog.skills;
      if (categoryId) {
        skills = skills.filter((s) => s.categoryId === categoryId);
      }
      if (query) {
        skills = skills.filter(
          (s) =>
            s.name.toLowerCase().includes(query) ||
            s.description.toLowerCase().includes(query) ||
            s.category.toLowerCase().includes(query),
        );
      }
      return createSuccessResponse(id, {
        ...catalog,
        skills,
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

  private async handleInstall(params: unknown, id: string) {
    const raw = (params ?? {}) as { source?: unknown; skills?: unknown };
    const source = typeof raw.source === 'string' ? raw.source.trim() : '';
    if (!source) {
      return createErrorResponse(id, 'VALIDATION', 'source is required');
    }
    const skills = Array.isArray(raw.skills)
      ? raw.skills.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : undefined;

    try {
      const { result } = await installFromSource(source, {
        skills: skills && skills.length > 0 ? skills : undefined,
        targetDir: userDir(),
      });

      try {
        this.ctx.getServer()?.agent.reloadSkills();
      } catch {
        /* ignore */
      }

      this.ctx.broadcastEvent('skill.installed', {
        source,
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

    const dest = path.join(userDir(), name);
    const resolvedDest = path.resolve(dest);
    const resolvedUser = path.resolve(userDir());
    if (
      !resolvedDest.startsWith(resolvedUser + path.sep) &&
      resolvedDest !== resolvedUser
    ) {
      return createErrorResponse(id, 'VALIDATION', 'Invalid skill name');
    }

    if (fs.existsSync(path.join(builtinDir(), name))) {
      return createErrorResponse(id, 'VALIDATION', 'Cannot remove built-in skill');
    }
    if (!fs.existsSync(dest)) {
      return createErrorResponse(id, 'NOT_FOUND', `Skill not found: ${name}`);
    }

    try {
      fs.rmSync(dest, { recursive: true, force: true });
      try {
        this.ctx.getServer()?.agent.reloadSkills();
      } catch {
        /* ignore */
      }
      this.ctx.broadcastEvent('skill.removed', { name });
      return createSuccessResponse(id, { name });
    } catch (error) {
      return createErrorResponse(
        id,
        'INTERNAL',
        error instanceof Error ? error.message : 'Remove failed',
      );
    }
  }
}
