/**
 * MCP 模块 — barrel export
 */

export { McpClient, mcpToolToAiTool } from './McpClient.js';
export type { McpToolDefinition, McpServerInfo, McpToolCaller } from './McpClient.js';

export { McpRemoteClient } from './McpRemoteClient.js';

export { McpManager } from './McpManager.js';
export type { McpServerStatusCallback } from './McpManager.js';

export {
  getMcpConfigPath,
  loadPersistedMcpServers,
  savePersistedMcpServers,
  upsertPersistedMcpServer,
  removePersistedMcpServer,
} from './mcp-config-store.js';

export {
  loadPersistedMcpServersIntoManager,
  type LoadPersistedMcpOptions,
} from './load-persisted.js';
