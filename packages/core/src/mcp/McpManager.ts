/**
 * McpManager — MCP 服务器生命周期管理器
 *
 * 管理多个 MCP 服务器连接的生命周期：
 * - 启动/停止服务器（stdio 或 HTTP remote）
 * - 崩溃自动重启（stdio）
 * - 暴露统一的 Tool 注册表
 * - 退出时清理所有连接
 */

import { type Tool } from 'ai';
import {
  isHttpMcpConfig,
  normalizeMcpServerConfig,
  type McpServerConfig,
} from '../providers/types.js';
import { McpClient, type McpToolDefinition, type McpServerInfo, mcpToolToAiTool } from './McpClient.js';
import { McpRemoteClient } from './McpRemoteClient.js';

export type { McpServerInfo, McpToolDefinition } from './McpClient.js';

type McpConnection = McpClient | McpRemoteClient;

/**
 * MCP 服务器连接状态变化回调
 */
export type McpServerStatusCallback = (serverId: string, connected: boolean, error?: string) => void;

/**
 * MCP 管理器
 */
export class McpManager {
  private clients: Map<string, McpConnection> = new Map();
  private toolRegistry: Map<string, Tool> = new Map();
  private serverToTools: Map<string, string[]> = new Map(); // serverId → toolNames[]
  private toolToServer: Map<string, string> = new Map(); // toolName → serverId

  /** 工具注册回调（由 Coordinator 设置，注册 tool 到运行中的 agent） */
  onToolRegistered?: (toolName: string, tool: Tool) => void;
  /** 工具注销回调 */
  onToolUnregistered?: (toolName: string) => void;
  /** 状态变化回调 */
  onStatusChange?: McpServerStatusCallback;

  /**
   * 添加并启动一个 MCP 服务器
   */
  async addServer(serverId: string, config: McpServerConfig): Promise<McpServerInfo> {
    if (this.clients.has(serverId)) {
      await this.removeServer(serverId);
    }

    const normalized = normalizeMcpServerConfig(config);
    const client: McpConnection = isHttpMcpConfig(normalized)
      ? new McpRemoteClient(serverId, normalized)
      : new McpClient(serverId, normalized);

    client.onDisconnect = (id: string, err?: Error) => {
      this.onStatusChange?.(id, false, err?.message);
    };

    this.clients.set(serverId, client);

    try {
      await client.connect();

      const tools = client.tools;
      for (const mcpTool of tools) {
        this.registerMcpTool(serverId, mcpTool, client);
      }

      this.onStatusChange?.(serverId, true);
    } catch (error) {
      this.clients.delete(serverId);
      const msg = error instanceof Error ? error.message : String(error);
      this.onStatusChange?.(serverId, false, msg);
      throw new Error(`Failed to connect MCP server '${serverId}': ${msg}`);
    }

    return this.getServerInfo(serverId)!;
  }

  /**
   * 移除并停止一个 MCP 服务器
   */
  async removeServer(serverId: string): Promise<boolean> {
    const client = this.clients.get(serverId);
    if (!client) return false;

    const toolNames = this.serverToTools.get(serverId) ?? [];
    for (const toolName of toolNames) {
      this.toolRegistry.delete(toolName);
      this.toolToServer.delete(toolName);
      this.onToolUnregistered?.(toolName);
    }
    this.serverToTools.delete(serverId);

    await client.disconnect();
    this.clients.delete(serverId);

    this.onStatusChange?.(serverId, false);
    return true;
  }

  getAllTools(): Record<string, Tool> {
    return Object.fromEntries(this.toolRegistry.entries());
  }

  getAllServerInfo(): McpServerInfo[] {
    const result: McpServerInfo[] = [];
    for (const [serverId, client] of this.clients) {
      result.push({
        serverId,
        config: client.config,
        tools: client.tools,
        connected: client.connected,
        pid: client.pid,
      });
    }
    return result;
  }

  getServerInfo(serverId: string): McpServerInfo | undefined {
    const client = this.clients.get(serverId);
    if (!client) return undefined;
    return {
      serverId,
      config: client.config,
      tools: client.tools,
      connected: client.connected,
      pid: client.pid,
    };
  }

  hasServer(serverId: string): boolean {
    return this.clients.has(serverId);
  }

  hasTool(toolName: string): boolean {
    return this.toolRegistry.has(toolName);
  }

  async restartServer(serverId: string): Promise<boolean> {
    const client = this.clients.get(serverId);
    if (!client) return false;

    const config = client.config;
    await this.removeServer(serverId);
    await this.addServer(serverId, config);
    return true;
  }

  async dispose(): Promise<void> {
    const serverIds = Array.from(this.clients.keys());
    await Promise.all(serverIds.map((id) => this.removeServer(id)));
  }

  private registerMcpTool(serverId: string, mcpTool: McpToolDefinition, client: McpConnection): void {
    const toolName = this.resolveToolName(serverId, mcpTool.name);

    if (this.toolRegistry.has(toolName)) {
      return;
    }

    const aiTool = mcpToolToAiTool(mcpTool, client);
    this.toolRegistry.set(toolName, aiTool);

    const tools = this.serverToTools.get(serverId) ?? [];
    tools.push(toolName);
    this.serverToTools.set(serverId, tools);
    this.toolToServer.set(toolName, serverId);

    this.onToolRegistered?.(toolName, aiTool);
  }

  private resolveToolName(serverId: string, toolName: string): string {
    const sanitizedServerId = serverId.replace(/[^a-zA-Z0-9_-]/g, '_');

    if (!this.toolRegistry.has(toolName) && !this.toolToServer.has(toolName)) {
      return toolName;
    }

    return `${sanitizedServerId}_${toolName}`;
  }
}
