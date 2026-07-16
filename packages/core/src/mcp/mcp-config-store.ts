/**
 * MCP 持久化配置 — `.hive/mcp-servers.json`
 *
 * 供 mcp-install 工具、Settings mcp.enable/disable、boot reload 共用。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_WORKSPACE_DIR } from '../workspace/index.js';
import {
  type McpServerConfig,
  normalizeMcpServerConfig,
} from '../providers/types.js';

export function getMcpConfigPath(cwd: string = process.cwd()): string {
  return path.resolve(cwd, DEFAULT_WORKSPACE_DIR, 'mcp-servers.json');
}

/**
 * 读取已持久化的 MCP 服务器配置。
 * 损坏/缺失时返回空对象。
 */
export function loadPersistedMcpServers(cwd: string = process.cwd()): Record<string, McpServerConfig> {
  const configPath = getMcpConfigPath(cwd);
  if (!fs.existsSync(configPath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, McpServerConfig>;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, McpServerConfig> = {};
    for (const [id, cfg] of Object.entries(raw)) {
      if (!cfg || typeof cfg !== 'object') continue;
      out[id] = normalizeMcpServerConfig(cfg);
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * 写入 MCP 服务器配置（全量替换）。
 */
export function savePersistedMcpServers(
  servers: Record<string, McpServerConfig>,
  cwd: string = process.cwd(),
): void {
  const configPath = getMcpConfigPath(cwd);
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const normalized: Record<string, McpServerConfig> = {};
  for (const [id, cfg] of Object.entries(servers)) {
    normalized[id] = normalizeMcpServerConfig(cfg);
  }
  fs.writeFileSync(configPath, JSON.stringify(normalized, null, 2), 'utf-8');
}

/**
 * Upsert 单个服务器并落盘。
 */
export function upsertPersistedMcpServer(
  serverId: string,
  config: McpServerConfig,
  cwd: string = process.cwd(),
): Record<string, McpServerConfig> {
  const servers = loadPersistedMcpServers(cwd);
  servers[serverId] = normalizeMcpServerConfig(config);
  savePersistedMcpServers(servers, cwd);
  return servers;
}

/**
 * 删除单个服务器并落盘。
 */
export function removePersistedMcpServer(
  serverId: string,
  cwd: string = process.cwd(),
): Record<string, McpServerConfig> {
  const servers = loadPersistedMcpServers(cwd);
  delete servers[serverId];
  savePersistedMcpServers(servers, cwd);
  return servers;
}
