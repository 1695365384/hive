/**
 * McpHandler — MCP 目录与一键启用
 *
 * mcp.catalog / mcp.list / mcp.enable / mcp.disable
 */

import {
  isOfficeCliMcpRegistered,
} from '../../../officecli-setup.js'
import {
  findCatalogEntry,
  loadMcpCatalog,
  toPublicCatalogEntry,
  type McpCatalogEntry,
} from '../../../mcp-catalog.js'
import {
  removePersistedMcpServer,
  upsertPersistedMcpServer,
  type McpServerConfig,
} from '@bundy-lmw/hive-core'
import type { HandlerContext, MethodHandler } from '../handler-context.js'
import { WsDomainHandler } from './base.js'
import { createSuccessResponse, createErrorResponse } from '../types.js'

function getMcpManager(ctx: HandlerContext) {
  return ctx.getServer()?.agent?.context?.mcpManager ?? null
}

export class McpHandler extends WsDomainHandler {
  register(): Map<string, MethodHandler> {
    return new Map<string, MethodHandler>([
      ['mcp.catalog', this.handleCatalog.bind(this)],
      ['mcp.list', this.handleList.bind(this)],
      ['mcp.enable', this.handleEnable.bind(this)],
      ['mcp.disable', this.handleDisable.bind(this)],
    ])
  }

  private handleCatalog(_params: unknown, id: string) {
    try {
      const catalog = loadMcpCatalog()
      const enabledIds = new Set(
        (getMcpManager(this.ctx)?.getAllServerInfo() ?? []).map((s) => s.serverId),
      )
      if (isOfficeCliMcpRegistered()) enabledIds.add('officecli')

      return createSuccessResponse(id, {
        title: catalog.title,
        description: catalog.description,
        entries: catalog.entries.map((e: McpCatalogEntry) => ({
          ...toPublicCatalogEntry(e),
          enabled: enabledIds.has(e.id) || (e.builtin && e.id === 'officecli' && isOfficeCliMcpRegistered()),
        })),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return createErrorResponse(id, 'INTERNAL', `Failed to load MCP catalog: ${msg}`)
    }
  }

  private handleList(_params: unknown, id: string) {
    try {
      const manager = getMcpManager(this.ctx)
      const servers = (manager?.getAllServerInfo() ?? []).map((s) => ({
        id: s.serverId,
        connected: s.connected,
        toolCount: s.tools.length,
        tools: s.tools.map((t) => t.name),
        transport: (s.config as { transport?: string }).transport
          ?? ((s.config as { url?: string }).url ? 'http' : 'stdio'),
      }))
      return createSuccessResponse(id, { servers })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return createErrorResponse(id, 'INTERNAL', `Failed to list MCP servers: ${msg}`)
    }
  }

  private async handleEnable(params: unknown, id: string) {
    const serverId = (params as { id?: string } | null)?.id?.trim()
    if (!serverId) {
      return createErrorResponse(id, 'VALIDATION', 'Missing required parameter: id')
    }

    const entry = findCatalogEntry(serverId)
    if (!entry) {
      return createErrorResponse(id, 'NOT_FOUND', '不可用：不在精选目录中')
    }
    if (entry.builtin) {
      return createErrorResponse(id, 'VALIDATION', 'BUILTIN_READONLY: 内置 MCP 不可手动启用/关闭')
    }
    if (entry.status === 'comingSoon') {
      return createErrorResponse(id, 'VALIDATION', 'NOT_AVAILABLE: 即将上线')
    }

    const manager = getMcpManager(this.ctx)
    if (!manager) {
      return createErrorResponse(id, 'INTERNAL', 'MCP Manager is not available')
    }

    const config = resolveEnableConfig(entry)
    if (!config) {
      return createErrorResponse(id, 'VALIDATION', 'Catalog entry has no connectable config')
    }

    try {
      await manager.addServer(serverId, config)
      upsertPersistedMcpServer(serverId, config)
      const info = manager.getServerInfo(serverId)
      this.ctx.broadcastEvent('mcp.enabled', { id: serverId, toolCount: info?.tools.length ?? 0 })
      return createSuccessResponse(id, {
        id: serverId,
        connected: info?.connected ?? false,
        tools: info?.tools.map((t) => t.name) ?? [],
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return createErrorResponse(
        id,
        'INTERNAL',
        msg.includes('timeout') ? `连接超时: ${msg}` : `启动失败: ${msg}`,
      )
    }
  }

  private async handleDisable(params: unknown, id: string) {
    const serverId = (params as { id?: string } | null)?.id?.trim()
    if (!serverId) {
      return createErrorResponse(id, 'VALIDATION', 'Missing required parameter: id')
    }

    const entry = findCatalogEntry(serverId)
    if (entry?.builtin || serverId === 'officecli') {
      return createErrorResponse(id, 'VALIDATION', 'BUILTIN_READONLY: 内置 MCP 不可关闭')
    }

    const manager = getMcpManager(this.ctx)
    if (!manager) {
      return createErrorResponse(id, 'INTERNAL', 'MCP Manager is not available')
    }

    try {
      await manager.removeServer(serverId)
      removePersistedMcpServer(serverId)
      this.ctx.broadcastEvent('mcp.disabled', { id: serverId })
      return createSuccessResponse(id, { id: serverId, disabled: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return createErrorResponse(id, 'INTERNAL', `Failed to disable MCP: ${msg}`)
    }
  }
}

function resolveEnableConfig(entry: McpCatalogEntry): McpServerConfig | null {
  if (entry.config) return entry.config
  return null
}
