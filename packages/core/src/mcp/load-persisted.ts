/**
 * Boot 时将 `.hive/mcp-servers.json` 加载进 McpManager
 */

import type { McpManager } from './McpManager.js';
import { loadPersistedMcpServers } from './mcp-config-store.js';

const DEFAULT_SKIP = new Set(['officecli']);

export type LoadPersistedMcpOptions = {
  cwd?: string;
  /** 跳过的 serverId（默认含 officecli，由 officecli-setup 负责） */
  skipIds?: Iterable<string>;
  onError?: (serverId: string, error: unknown) => void;
};

/**
 * 加载持久化 MCP 并 addServer。单个失败不影响其余。
 */
export async function loadPersistedMcpServersIntoManager(
  manager: McpManager,
  options: LoadPersistedMcpOptions = {},
): Promise<{ loaded: string[]; failed: string[] }> {
  const skip = new Set(options.skipIds ?? DEFAULT_SKIP);
  const servers = loadPersistedMcpServers(options.cwd);
  const loaded: string[] = [];
  const failed: string[] = [];

  for (const [serverId, config] of Object.entries(servers)) {
    if (skip.has(serverId)) continue;
    if (config.enabled === false) continue;
    try {
      await manager.addServer(serverId, config);
      loaded.push(serverId);
    } catch (err) {
      failed.push(serverId);
      options.onError?.(serverId, err);
    }
  }

  return { loaded, failed };
}
