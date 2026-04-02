/**
 * Grep 工具 — 文件内容正则搜索
 *
 * 使用 AI SDK tool() + Zod schema 定义。
 * 使用 Node.js 原生 fs + 正则匹配，无 shell 依赖。
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import { isPathAllowed } from './utils/security.js';
import { truncateOutput } from './utils/output-safety.js';
import type { ToolResult } from '../harness/types.js';
import { withHarness } from '../harness/with-harness.js';
import type { RawTool } from '../harness/with-harness.js';

/** 最大递归深度 */
const MAX_DEPTH = 20;
/** 最大扫描文件数 */
const MAX_FILES = 10000;

/** Grep 工具输入 schema */
const grepInputSchema = z.object({
  pattern: z.string().describe('Regex search pattern'),
  path: z.string().optional().describe('Directory to search in, defaults to working directory'),
  glob: z.string().optional().describe('File type filter, e.g. "*.ts", "*.tsx". Defaults to all files'),
  maxResults: z.number().max(1000).optional().describe('Max number of results to return, default 50'),
  caseInsensitive: z.boolean().optional().describe('Case insensitive search, default false'),
});

export type GrepToolInput = z.infer<typeof grepInputSchema>;

interface GrepResult {
  file: string;
  line: number;
  text: string;
}

/**
 * 检查文件是否匹配 glob 过滤器
 */
function matchesGlob(filePath: string, globFilter: string): boolean {
  if (!globFilter || globFilter === '*') return true;
  // Extract extension from glob pattern (e.g., "*.ts" → ".ts", "*.tsx" → ".tsx")
  const raw = globFilter.replace(/^\*+/, '');
  const targetExt = raw.startsWith('.') ? raw : '.' + raw;
  return extname(filePath).toLowerCase() === targetExt.toLowerCase();
}

/**
 * 递归搜索目录中的文件
 */
async function collectFiles(dir: string, depth: number): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];

  const files: string[] = [];
  let entries: Array<{ name: string; isDir: boolean }>;

  try {
    const raw = await readdir(dir, { withFileTypes: true });
    entries = raw.map(e => ({ name: e.name, isDir: e.isDirectory() }));
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDir) {
      const subFiles = await collectFiles(fullPath, depth + 1);
      files.push(...subFiles);
      if (files.length >= MAX_FILES) return files;
    } else {
      files.push(fullPath);
      if (files.length >= MAX_FILES) return files;
    }
  }

  return files;
}

/** 创建原始工具（execute → ToolResult，不经 harness） */
export function createRawGrepTool(): RawTool<GrepToolInput> {
  return {
    description: 'Search file contents using regex. Returns matching file paths, line numbers, and matched lines.',
    inputSchema: zodSchema(grepInputSchema),
    execute: async ({ pattern, path: searchPath, glob: globFilter, maxResults, caseInsensitive }): Promise<ToolResult> => {
      const max = maxResults ?? 50;
      const dir = resolve(searchPath || process.cwd());

      // 路径约束检查
      if (!isPathAllowed(dir)) {
        return { ok: false, code: 'PATH_BLOCKED', error: `Search path is outside the allowed working directory: ${dir}`, context: { path: dir } };
      }

      // 正则表达式校验
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, caseInsensitive ? 'i' : '');
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ok: false, code: 'INVALID_PARAM', error: `Invalid regex: ${msg}`, context: { pattern } };
      }

      try {
        const files = await collectFiles(dir, 0);

        const results: GrepResult[] = [];

        for (const filePath of files) {
          if (!matchesGlob(filePath, globFilter || '*')) continue;

          let content: string;
          try {
            content = await readFile(filePath, 'utf-8');
          } catch {
            continue;
          }

          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i]!)) {
              results.push({ file: filePath, line: i + 1, text: lines[i]! });
              if (results.length >= max * 10) break;
            }
          }

          if (results.length >= max * 10) break;
        }

        if (results.length === 0) {
          return { ok: true, code: 'OK', data: `No matches found for "${pattern}"` };
        }

        const display = results.slice(0, max);
        const formatted = display.map(r => `${r.file}:${r.line}: ${r.text}`);

        const output = formatted.join('\n');
        if (results.length > max) {
          return { ok: true, code: 'OK', data: truncateOutput(output + `\n\n[${results.length} matches total, showing first ${max}]`) };
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
 * 创建 Grep 工具（AI SDK 兼容，execute → string）
 *
 * 内部使用 withHarness 包装 rawTool 逻辑。
 */
export function createGrepTool(): Tool<GrepToolInput, string> {
  return withHarness(createRawGrepTool(), { toolName: 'grep-tool' });
}

export const grepTool = createGrepTool();
