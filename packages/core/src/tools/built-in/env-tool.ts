/**
 * Env 工具 — 按需查询系统能力
 *
 * 从 SQLite env_tools 表中按关键词或类别查询工具信息。
 * Agent 在需要了解系统环境时调用此工具，避免全量注入 prompt。
 */

import { zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import os from 'node:os';
import type { ToolResult } from '../harness/types.js';
import { withHarness, type RawTool } from '../harness/with-harness.js';

/** Valid tool categories */
const VALID_CATEGORIES = [
  'runtime', 'pkgManager', 'buildTool', 'container', 'vcs', 'system', 'native-app', 'other',
] as const;

/** Env tool input schema */
const envInputSchema = z.object({
  query: z.string().optional().describe('Fuzzy search keyword, e.g. "python", "docker", "notes"'),
  category: z.enum(VALID_CATEGORIES).optional()
    .describe('Exact category name (runtime / pkgManager / buildTool / container / vcs / system / native-app / other)'),
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
 * Query category summary from SQLite (overview mode).
 * Returns category names and tool counts, ordered by count descending.
 */
async function queryOverview(
  dbPath: string,
): Promise<Array<{ category: string; count: number }> | null> {
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath, { readonly: true });

  try {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM env_tools').get() as { cnt: number };
    if (count.cnt === 0) return null;

    return db.prepare(
      'SELECT category, COUNT(*) as count FROM env_tools GROUP BY category ORDER BY count DESC',
    ).all() as Array<{ category: string; count: number }>;
  } finally {
    db.close();
  }
}

/**
 * Get platform-specific native app interaction hint.
 * Teaches the agent the correct pattern (e.g., osascript) without hardcoding per-app commands.
 */
function getNativeAppPlatformHint(): string {
  const platform = os.platform();
  switch (platform) {
    case 'darwin':
      return [
        'Interact with macOS apps via AppleScript through bash:',
        '  osascript -e \'tell application "AppName" to <action>\'',
        'Examples: `get name of every note`, `get body of note 1`, `count of notes`',
        'Note: First call may be slow (app launch). Use timeout of 30s.',
        'Do NOT access application databases or data files directly.',
      ].join('\n');
    case 'win32':
      return [
        'Interact with Windows apps via PowerShell through bash:',
        '  powershell -Command "Start-Process AppName"',
        'Do NOT access application databases or data files directly.',
      ].join('\n');
    case 'linux':
      return [
        'Interact with Linux apps via CLI or D-Bus through bash.',
        'Do NOT access application databases or data files directly.',
      ].join('\n');
    default:
      return '';
  }
}

/**
 * Create env rawTool (execute → ToolResult)
 */
export function createRawEnvTool(): RawTool<EnvToolInput> {
  return {
    description: 'Discover available tools, runtimes, native applications, and system capabilities. Call env() with no parameters for a category overview. Use env(query="keyword") or env(category="name") to find specific capabilities. Always call env() first when interacting with unfamiliar applications or services.',
    inputSchema: zodSchema(envInputSchema),
    execute: async ({ query, category }): Promise<ToolResult> => {
      const dbPath = dbProvider();
      if (!dbPath) {
        return { ok: false, code: 'NOT_CONFIGURED', error: 'Database path not configured' };
      }

      try {
        // Overview mode: no query and no category → return category summary
        if (!query && !category) {
          const overview = await queryOverview(dbPath);
          if (overview === null) {
            return { ok: true, code: 'OK', data: 'Environment probing not yet complete, please try again later.' };
          }

          const lines = overview.map(
            row => `- **${row.category}** (${row.count} tools)`,
          );
          lines.push('');
          lines.push('Use `env(category="<name>")` to list tools in a specific category.');
          lines.push('Use `env(query="<keyword>")` to search by keyword.');
          return { ok: true, code: 'OK', data: lines.join('\n') };
        }

        const results = await queryDb(dbPath, query, category);

        if (results === null) {
          return { ok: true, code: 'OK', data: 'Environment probing not yet complete, please try again later.' };
        }

        if (results.length === 0) {
          const hint = query
            ? `No tools found matching "${query}"`
            : `No tools in category "${category}"`;
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

          // For native-app, prepend platform-specific interaction hint
          if (cat === 'native-app') {
            const hint = getNativeAppPlatformHint();
            if (hint) {
              lines.push(hint);
            }
          }

          const isNativeApp = cat === 'native-app';
          for (const item of items) {
            const version = item.version ? ` ${item.version}` : '';
            if (isNativeApp) {
              lines.push(`- **${item.name}**${version} — access: \`${item.path}\``);
            } else {
              lines.push(`- **${item.name}**${version} (${item.path})`);
            }
          }
          lines.push('');
        }

        return { ok: true, code: 'OK', data: lines.join('\n') };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ok: false, code: 'DB_ERROR', error: `Query failed: ${msg}` };
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
