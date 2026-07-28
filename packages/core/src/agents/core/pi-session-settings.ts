/**
 * Hive defaults for pi-coding-agent Settings (compaction on; no dual Hive compressor).
 */

/** Runtime overrides passed to Settings.isolated / Settings.init. */
export const HIVE_PI_COMPACTION_OVERRIDES = {
  'compaction.enabled': true,
  'compaction.midTurnEnabled': true,
} as const;

/**
 * Build an isolated pi Settings instance with compaction enabled.
 * Returns undefined when Settings cannot be loaded (tests that inject createAgentSession).
 */
export async function createHivePiSessionSettings(): Promise<unknown | undefined> {
  try {
    const omp = await import('@oh-my-pi/pi-coding-agent');
    const Settings = omp.Settings as {
      isolated?: (overrides?: Record<string, unknown>) => unknown;
    };
    if (typeof Settings?.isolated !== 'function') return undefined;
    return Settings.isolated({ ...HIVE_PI_COMPACTION_OVERRIDES });
  } catch {
    return undefined;
  }
}
