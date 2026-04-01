/**
 * Env 工具 — 按需查询系统能力
 *
 * 从 SQLite env_tools 表中按关键词或类别查询工具信息。
 * Agent 在需要了解系统环境时调用此工具，避免全量注入 prompt。
 */

import { zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import type { ToolResult } from '../harness/types.js';
import { withHarness, type RawTool } from '../harness/with-harness.js';

/** Valid tool categories */
const VALID_CATEGORIES = [
  'runtime', 'pkgManager', 'buildTool', 'container', 'vcs', 'system', 'other',
] as const;

/** Env tool input schema */
const envInputSchema = z.object({
  query: z.string().optional().describe('模糊搜索关键词（如 "python"、"docker"）'),
  category: z.enum(VALID_CATEGORIES).optional()
    .describe('精确类别名（runtime / pkgManager / buildTool / container / vcs / system / other）'),
});

export type EnvToolInput = z.infer<typeof envInputSchema>;

/** Get SQLite database path from global state */
type DbProvider = () => string | undefined;

/** Global db provider, set during tool initialization */
let dbProvider: DbProvider = () => undefined;

/** Set the database path provider */
export function setEnvDbProvider(provider: DbProvider): void {
  dbProvider = provider;
}

/**
 * Query env_tools table from SQLite.
 */
async function queryDb(
  dbPath: string,
  query?: string,
  category?: string,
): Promise<Array<{ name: string; category: string; version: string | null; path: string }> | null> {
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath, { readonly: true });

  try {
    // Check if table has data
    const count = db.prepare('SELECT COUNT(*) as cnt FROM env_tools').get() as { cnt: number };
    if (count.cnt === 0) return null; // Signal: no data yet

    let sql = 'SELECT name, category, version, path FROM env_tools WHERE 1=1';
    const params: string[] = [];

    if (query) {
      sql += ' AND name LIKE ?';
      params.push(`%${query}%`);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ' ORDER BY category, name LIMIT 100';
    return db.prepare(sql).all(...params) as Array<{ name: string; category: string; version: string | null; path: string }>;
  } finally {
    db.close();
  }
}

/**
 * Create env rawTool (execute → ToolResult)
 */
export function createRawEnvTool(): RawTool<EnvToolInput> {
  return {
    description: '查询系统环境中可用的工具和能力。支持按关键词模糊搜索或按类别精确查询。返回工具名称、类别、版本号和路径。可用类别：runtime（语言运行时）、pkgManager（包管理器）、buildTool（构建工具）、container（容器）、vcs（版本控制）、system（系统工具）、other（其他）。',
    inputSchema: zodSchema(envInputSchema),
    execute: async ({ query, category }): Promise<ToolResult> => {
      const dbPath = dbProvider();
      if (!dbPath) {
        return { ok: false, code: 'NOT_CONFIGURED', error: '数据库路径未配置' };
      }

      try {
        const results = await queryDb(dbPath, query, category);

        if (results === null) {
          return { ok: true, code: 'OK', data: '环境探测尚未完成，请稍后再试。' };
        }

        if (results.length === 0) {
          const hint = query
            ? `未找到匹配 "${query}" 的工具`
            : `类别 "${category}" 下没有工具`;
          return { ok: true, code: 'OK', data: hint };
        }

        // Group by category
        const grouped = new Map<string, typeof results>();
        for (const r of results) {
          const list = grouped.get(r.category) ?? [];
          list.push(r);
          grouped.set(r.category, list);
        }

        const lines: string[] = [];
        for (const [cat, items] of grouped) {
          lines.push(`### ${cat}`);
          for (const item of items) {
            const version = item.version ? ` ${item.version}` : '';
            lines.push(`- **${item.name}**${version} (${item.path})`);
          }
          lines.push('');
        }

        return { ok: true, code: 'OK', data: lines.join('\n') };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ok: false, code: 'DB_ERROR', error: `查询失败: ${msg}` };
      }
    },
  };
}

/**
 * Create env tool (AI SDK compatible, execute → string)
 */
export function createEnvTool(): Tool<EnvToolInput, string> {
  return withHarness(createRawEnvTool(), { maxRetries: 0, baseDelay: 0, toolName: 'env' });
}

export const envTool = createEnvTool();
