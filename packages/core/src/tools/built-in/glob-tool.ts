/**
 * Glob 工具 — 文件名模式匹配
 *
 * 使用 AI SDK tool() + Zod schema 定义。
 * 路径约束、深度限制、条目数限制。
 */

import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import { isPathAllowed } from './utils/security.js';
import { truncateOutput } from './utils/output-safety.js';
import type { ToolResult } from '../harness/types.js';
import { withHarness } from '../harness/with-harness.js';
import type { RawTool } from '../harness/with-harness.js';

/** 最大递归深度 */
const MAX_DEPTH = 20;
/** 最大匹配条目数 */
const MAX_ENTRIES = 10000;

/**
 * 简单的 glob 匹配（支持 * 和 **）
 *
 * 足够覆盖常见使用场景，避免引入 fast-glob 额外依赖。
 */
async function simpleGlob(dir: string, pattern: string): Promise<string[]> {
  const results: string[] = [];
  const parts = pattern.split('/').filter(Boolean);

  async function walk(currentDir: string, partIndex: number, depth: number): Promise<void> {
    if (partIndex >= parts.length || depth > MAX_DEPTH || results.length >= MAX_ENTRIES) return;
    const part = parts[partIndex]!;
    const nextIndex = partIndex + 1;
    const isLast = nextIndex >= parts.length;

    // ** matches zero or more directory levels — also try skipping ** entirely
    if (part === '**') {
      // Zero-depth: match remaining pattern in current directory
      await walk(currentDir, nextIndex, depth);
    }

    let entries: Array<{ name: string; isDirectory: () => boolean }>;
    try {
      const rawEntries = await readdir(currentDir, { withFileTypes: true });
      entries = rawEntries.map(e => ({ name: e.name, isDirectory: () => e.isDirectory() }));
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= MAX_ENTRIES) return;
      const fullPath = join(currentDir, entry.name);
      if (entry.name.startsWith('.') && !part.startsWith('.')) continue;

      if (part === '**') {
        // ** matches one or more directory levels
        if (entry.isDirectory()) {
          // Stay at ** to match more nested dirs
          await walk(fullPath, partIndex, depth + 1);
        }
      } else if (entry.name === part || matchGlobPart(entry.name, part)) {
        if (isLast) {
          results.push(fullPath);
        } else if (entry.isDirectory()) {
          await walk(fullPath, nextIndex, depth + 1);
        }
      }
    }
  }

  await walk(dir, 0, 0);
  return results;
}

function matchGlobPart(name: string, pattern: string): boolean {
  // 先转义所有正则元字符，再将 glob 特殊字符替换为对应的正则
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`).test(name);
}

/** Glob 工具输入 schema */
const globInputSchema = z.object({
  pattern: z.string().describe('Glob pattern, e.g. "**/*.ts", "src/**/*.py"'),
  path: z.string().optional().describe('Root directory to search in, defaults to working directory'),
  maxResults: z.number().max(1000).optional().describe('Max number of results to return, default 500'),
});

export type GlobToolInput = z.infer<typeof globInputSchema>;

/** 创建原始工具（execute → ToolResult，不经 harness） */
export function createRawGlobTool(): RawTool<GlobToolInput> {
  return {
    description: 'Search file paths by name pattern. Supports * (match any chars) and ** (match directory levels). Returns matching file paths. Use maxResults to control output size (default 500). Narrow the pattern first for broad searches.',
    inputSchema: zodSchema(globInputSchema),
    execute: async ({ pattern, path: searchPath, maxResults }): Promise<ToolResult> => {
      const max = maxResults ?? 500;
      const dir = resolve(searchPath || process.cwd());

      // 路径约束检查
      if (!isPathAllowed(dir)) {
        return { ok: false, code: 'PATH_BLOCKED', error: `Search path is outside the allowed working directory: ${dir}`, context: { path: dir } };
      }

      try {
        const files = await simpleGlob(dir, pattern);

        // 按修改时间排序
        const withStats = await Promise.all(
          files.map(async (f) => {
            try {
              const s = await stat(f);
              return { path: f, mtime: s.mtimeMs };
            } catch {
              return { path: f, mtime: 0 };
            }
          }),
        );
        withStats.sort((a, b) => b.mtime - a.mtime);
        const sortedFiles = withStats.map(f => f.path);

        if (sortedFiles.length === 0) {
          return { ok: true, code: 'OK', data: `No files found matching "${pattern}"` };
        }

        let output: string;
        if (sortedFiles.length > max) {
          const display = sortedFiles.slice(0, max);
          output = display.join('\n') + `\n\n[${withStats.length} matches total, showing first ${max}]`;
        } else {
          output = sortedFiles.join('\n');
        }

        return { ok: true, code: 'OK', data: truncateOutput(output) };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ok: false, code: 'EXEC_ERROR', error: `Search failed: ${msg}` };
      }
    },
  };
}

/**
 * 创建 Glob 工具（AI SDK 兼容，execute → string）
 *
 * 内部使用 withHarness 包装 rawTool 逻辑。
 */
export function createGlobTool(): Tool<GlobToolInput, string> {
  return withHarness(createRawGlobTool(), { toolName: 'glob-tool' });
}

export const globTool = createGlobTool();
