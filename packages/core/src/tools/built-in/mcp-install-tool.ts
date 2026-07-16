/**
 * MCP Install 工具 — 让 Agent 自己安装 MCP 服务器
 *
 * MCP (Model Context Protocol) 服务器通过 stdio 协议向 AI 暴露工具。
 * 这个工具让 Agent 可以一句话安装和注册 MCP 服务器。
 *
 * 流程：
 * 1. 解析配置
 * 2. 权限确认
 * 3. Spawn MCP 服务器进程
 * 4. 握手初始化
 * 5. 获取工具列表
 * 6. 注册工具到 Coordinator
 * 7. 保存配置到 .hive/mcp-servers.json
 */

import { zodSchema, type Tool } from 'ai';
import { z } from 'zod';
import type { ToolResult } from '../harness/types.js';
import { withHarness } from '../harness/with-harness.js';
import type { RawTool } from '../harness/with-harness.js';
import type { McpManager } from '../../mcp/McpManager.js';
import {
  loadPersistedMcpServers,
  removePersistedMcpServer,
  savePersistedMcpServers,
} from '../../mcp/mcp-config-store.js';
import type { InstallConfirmCallback } from './skill-install-tool.js';

// ============================================
// 类型
// ============================================

/** MCP 服务器安装回调：获取 McpManager 实例 */
export type GetMcpManagerCallback = () => McpManager | null;

/** MCP 服务器配置已保存的回调 */
export type McpServersChangedCallback = (servers: Record<string, any>) => void;

// ============================================
// 全局回调
// ============================================

let getMcpManagerCallback: GetMcpManagerCallback | null = null;
let installConfirmCb: InstallConfirmCallback | null = null;
let mcpServersChangedCallback: McpServersChangedCallback | null = null;

export function setGetMcpManagerCallback(cb: GetMcpManagerCallback): void {
  getMcpManagerCallback = cb;
}

export function setMcpInstallConfirmCallback(cb: InstallConfirmCallback): void {
  installConfirmCb = cb;
}

export function setMcpServersChangedCallback(cb: McpServersChangedCallback): void {
  mcpServersChangedCallback = cb;
}

// ============================================
// Schema
// ============================================

const mcpInstallInputSchema = z.object({
  serverId: z.string().min(1)
    .describe('Unique identifier for the MCP server (e.g., "weather", "database", "github")'),
  command: z.string().min(1)
    .describe('Command to run the MCP server (e.g., "npx", "uvx", "python", or a direct binary path)'),
  args: z.array(z.string()).optional()
    .describe('Command line arguments for the MCP server'),
  env: z.record(z.string(), z.string()).optional()
    .describe('Optional environment variables for the MCP server'),
  remove: z.boolean().optional()
    .describe('If true, remove an installed MCP server instead of adding one'),
  list: z.boolean().optional()
    .describe('If true, list all installed MCP servers'),
});

export type McpInstallToolInput = z.infer<typeof mcpInstallInputSchema>;

// ============================================
// RawTool
// ============================================

export function createRawMcpInstallTool(): RawTool<McpInstallToolInput> {
  return {
    description: 'Install and register an MCP (Model Context Protocol) server. '
      + 'MCP servers expose external tools (like database queries, API calls, file operations) '
      + 'that the AI can use. Use this when the user asks to connect an external service, '
      + 'install a plugin, or add new capabilities via MCP.',
    inputSchema: zodSchema(mcpInstallInputSchema),
    execute: async ({ serverId, command, args, env, remove, list }): Promise<ToolResult> => {
      const mcpManager = getMcpManagerCallback?.() ?? null;

      try {
        // === list 模式 ===
        if (list) {
          if (!mcpManager) {
            return { ok: true, code: 'OK', data: 'MCP Manager is not available.' };
          }

          const servers = mcpManager.getAllServerInfo();
          if (servers.length === 0) {
            return { ok: true, code: 'OK', data: 'No MCP servers installed.' };
          }

          const lines = servers.map((s) => {
            const toolCount = s.tools.length;
            return `  - ${s.serverId} (${s.connected ? 'connected' : 'disconnected'}, ${toolCount} tool(s))`;
          });

          return {
            ok: true,
            code: 'OK',
            data: `Installed MCP servers:\n${lines.join('\n')}`,
          };
        }

        // === remove 模式 ===
        if (remove) {
          if (!mcpManager) {
            return { ok: false, code: 'EXEC_ERROR', error: 'MCP Manager is not available.' };
          }

          // 从配置中移除
          const configs = loadPersistedMcpServers();
          if (!configs[serverId]) {
            return { ok: false, code: 'EXEC_ERROR', error: `MCP server "${serverId}" is not installed.` };
          }

          const remaining = removePersistedMcpServer(serverId);

          // 从运行中移除
          await mcpManager.removeServer(serverId);

          mcpServersChangedCallback?.(remaining);

          return { ok: true, code: 'OK', data: `MCP server "${serverId}" removed.` };
        }

        // === install 模式 ===

        // 权限确认
        if (installConfirmCb) {
          const details = `Command: ${command} ${(args ?? []).join(' ')}`;
          const confirmed = await installConfirmCb('mcp', serverId, command, details);
          if (!confirmed) {
            return { ok: false, code: 'PERMISSION', error: 'MCP server installation was denied by the user', context: { reason: 'User denied' } };
          }
        }

        if (!mcpManager) {
          return { ok: false, code: 'EXEC_ERROR', error: 'MCP Manager is not available. Hive may not be fully initialized.' };
        }

        // 保存配置
        const configs = loadPersistedMcpServers();
        configs[serverId] = { transport: 'stdio', command, args, env };
        savePersistedMcpServers(configs);

        // 连接到 MCP 服务器
        await mcpManager.addServer(serverId, { transport: 'stdio', command, args, env });

        const serverInfo = mcpManager.getServerInfo(serverId);
        const toolNames = serverInfo?.tools.map((t) => t.name) ?? [];

        mcpServersChangedCallback?.(configs);

        if (toolNames.length === 0) {
          return {
            ok: true,
            code: 'OK',
            data: [
              `MCP server "${serverId}" connected successfully.`,
              'The server did not expose any tools.',
              'Config saved to .hive/mcp-servers.json',
            ].join('\n'),
          };
        }

        return {
          ok: true,
          code: 'OK',
          data: [
            `MCP server "${serverId}" installed and connected successfully.`,
            `Available tools (${toolNames.length}):`,
            ...toolNames.map((n) => `  - ${n}`),
            '',
            'These tools are now available for use.',
            'Config saved to .hive/mcp-servers.json',
          ].join('\n'),
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { ok: false, code: 'EXEC_ERROR', error: `Failed to install MCP server: ${msg}` };
      }
    },
  };
}

// ============================================
// AI SDK Tool
// ============================================

export function createMcpInstallTool(): Tool<McpInstallToolInput, string> {
  return withHarness(createRawMcpInstallTool(), { toolName: 'mcp-install-tool' });
}
