/**
 * Hive defaults for pi-coding-agent Settings:
 * - compaction on (session-boundary; mid-turn off)
 * - memory.backend = mnemopi (local SQLite recall/retain)
 */

import { resolve, dirname } from 'node:path';
import { resolveMnemopiDbPath, sanitizeMemoryBank } from '../../memory/MnemopiMemory.js';

/** Runtime overrides passed to Settings.isolated / Settings.init. */
export const HIVE_PI_COMPACTION_OVERRIDES = {
  'compaction.enabled': true,
  // mid-turn compaction is more aggressive and historically brittle with
  // injected history; keep session-boundary compaction for the满分 bar.
  'compaction.midTurnEnabled': false,
} as const;

export type HivePiSessionSettingsOpts = {
  /** Workspace root — mnemopi DB lands under `.hive/mnemopi/`. */
  workspaceDir?: string;
  /** Hive user id → mnemopi bank (per-user isolation). */
  userId?: string;
  /** Absolute override for mnemopi SQLite path. */
  mnemopiDbPath?: string;
};

/**
 * Full Settings.isolated overrides for Hive Desktop/Server sessions.
 */
export function buildHivePiSessionOverrides(
  opts: HivePiSessionSettingsOpts = {},
): Record<string, unknown> {
  const workspace = opts.workspaceDir?.trim() || process.cwd();
  const baseDb = opts.mnemopiDbPath?.trim() || resolveMnemopiDbPath(workspace);
  const bank = sanitizeMemoryBank(opts.userId ?? 'default');
  // Match MnemopiMemory: one SQLite file per user bank.
  const dbPath =
    baseDb === ':memory:'
      ? ':memory:'
      : resolve(dirname(resolve(baseDb)), `${bank}.db`);

  return {
    ...HIVE_PI_COMPACTION_OVERRIDES,
    'memory.backend': 'mnemopi',
    'mnemopi.dbPath': dbPath,
    'mnemopi.bank': bank,
    // Bank already encodes userId — keep scoping global so bank name is authoritative.
    'mnemopi.scoping': 'global',
    'mnemopi.noEmbeddings': true,
    'mnemopi.llmMode': 'none',
    'mnemopi.autoRecall': true,
    'mnemopi.autoRetain': true,
  };
}

/**
 * Build an isolated pi Settings instance with compaction + mnemopi enabled.
 * Returns undefined when Settings cannot be loaded (tests that inject createAgentSession).
 */
export async function createHivePiSessionSettings(
  opts: HivePiSessionSettingsOpts = {},
): Promise<unknown | undefined> {
  try {
    const omp = await import('@oh-my-pi/pi-coding-agent');
    const Settings = omp.Settings as {
      isolated?: (overrides?: Record<string, unknown>) => unknown;
    };
    if (typeof Settings?.isolated !== 'function') return undefined;
    return Settings.isolated(buildHivePiSessionOverrides(opts));
  } catch {
    return undefined;
  }
}
