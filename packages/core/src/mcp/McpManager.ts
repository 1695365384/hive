/**
 * McpManager — MCP 服务器生命周期管理器
 *
 * 管理多个 MCP 服务器进程的生命周期：
 * - 启动/停止服务器
 * - 崩溃自动重启
 * - 暴露统一的 Tool 注册表
 * - 退出时清理所有进程
 */

import { type Tool } from 'ai';
import type { McpServerConfig } from '../providers/types.js';
import { McpClient, type McpToolDefinition, type McpServerInfo } from './McpClient.js';
import { mcpToolToAiTool } from './McpClient.js';

export type { McpServerInfo, McpToolDefinition } from './McpClient.js';

/**
 * MCP 服务器连接状态变化回调
 */
export type McpServerStatusCallback = (serverId: string, connected: boolean, error?: string) => void;

/**
 * MCP 管理器
 */
export class McpManager {
  private clients: Map<string, McpClient> = new Map();
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
   *
   * @param serverId  唯一标识符
   * @param config    MCP 服务器配置（command + args + env）
   * @returns 服务器信息
   */
  async addServer(serverId: string, config: McpServerConfig): Promise<McpServerInfo> {
    // 如果已存在，先移除
    if (this.clients.has(serverId)) {
      await this.removeServer(serverId);
    }

    const client = new McpClient(serverId, config);

    client.onDisconnect = (id: string, err?: Error) => {
      this.onStatusChange?.(id, false, err?.message);
    };

    this.clients.set(serverId, client);

    try {
      await client.connect();

      // 注册工具
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

    // 注销该服务器的所有工具
    const toolNames = this.serverToTools.get(serverId) ?? [];
    for (const toolName of toolNames) {
      this.toolRegistry.delete(toolName);
      this.toolToServer.delete(toolName);
      this.onToolUnregistered?.(toolName);
    }
    this.serverToTools.delete(serverId);

    // 断开连接
    await client.disconnect();
    this.clients.delete(serverId);

    this.onStatusChange?.(serverId, false);
    return true;
  }

  /**
   * 获取所有已注册的 MCP 工具（AI SDK Tool 格式）
   */
  getAllTools(): Record<string, Tool> {
    return Object.fromEntries(this.toolRegistry.entries());
  }

  /**
   * 获取所有服务器信息
   */
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

  /**
   * 获取单个服务器信息
   */
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

  /**
   * 检查服务器是否已注册
   */
  hasServer(serverId: string): boolean {
    return this.clients.has(serverId);
  }

  /**
   * 检查工具名是否已被占用
   */
  hasTool(toolName: string): boolean {
    return this.toolRegistry.has(toolName);
  }

  /**
   * 重启指定服务器
   */
  async restartServer(serverId: string): Promise<boolean> {
    const client = this.clients.get(serverId);
    if (!client) return false;

    await this.removeServer(serverId);
    await this.addServer(serverId, client.config);
    return true;
  }

  /**
   * 清理所有服务器
   */
  async dispose(): Promise<void> {
    const serverIds = Array.from(this.clients.keys());
    await Promise.all(serverIds.map((id) => this.removeServer(id)));
  }

  // ============================================
  // 内部
  // ============================================

  private registerMcpTool(serverId: string, mcpTool: McpToolDefinition, client: McpClient): void {
    const toolName = this.resolveToolName(serverId, mcpTool.name);

    // 检查冲突
    if (this.toolRegistry.has(toolName)) {
      // 已存在同名工具，跳过
      return;
    }

    const aiTool = mcpToolToAiTool(mcpTool, client);
    this.toolRegistry.set(toolName, aiTool);

    // 记录映射
    const tools = this.serverToTools.get(serverId) ?? [];
    tools.push(toolName);
    this.serverToTools.set(serverId, tools);
    this.toolToServer.set(toolName, serverId);

    // 通知 Coordinator
    this.onToolRegistered?.(toolName, aiTool);
  }

  /**
   * 工具名解析：处理冲突
   *
   * 如果 MCP 工具名与已有工具冲突，加 `{serverId}_` 前缀
   */
  private resolveToolName(serverId: string, toolName: string): string {
    // 去掉 serverId 中的非法字符
    const sanitizedServerId = serverId.replace(/[^a-zA-Z0-9_-]/g, '_');

    // 检查是否与已有工具冲突
    if (!this.toolRegistry.has(toolName) && !this.toolToServer.has(toolName)) {
      return toolName;
    }

    // 有冲突，加前缀
    return `${sanitizedServerId}_${toolName}`;
  }
}
