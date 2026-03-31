/**
 * ConfigHandler — 配置管理域
 *
 * config.get / config.update / config.getProviderPresets
 */

import type { HandlerContext, MethodHandler } from '../handler-context.js'
import { WsDomainHandler } from './base.js'
import type { ConfigUpdateParams } from '../data-types.js'
import { createSuccessResponse, createErrorResponse } from '../types.js'

export class ConfigHandler extends WsDomainHandler {
  register(): Map<string, MethodHandler> {
    return new Map<string, MethodHandler>([
      ['config.get', this.handleConfigGet.bind(this)],
      ['config.update', this.handleConfigUpdate.bind(this)],
      ['config.getProviderPresets', this.handleGetProviderPresets.bind(this)],
    ])
  }

  private handleConfigGet(_params: unknown, id: string) {
    const config = this.ctx.loadConfig()
    return createSuccessResponse(id, this.ctx.sensitizeConfig(config))
  }

  private handleConfigUpdate(params: unknown, id: string) {
    if (!params || typeof params !== 'object') {
      return createErrorResponse(id, 'VALIDATION', 'params must be an object')
    }
    const updates = params as ConfigUpdateParams
    const config = this.ctx.loadConfig()

    if (updates.server) Object.assign(config.server, updates.server)
    if (updates.auth) Object.assign(config.auth, updates.auth)
    if (updates.provider) Object.assign(config.provider, updates.provider)
    if (updates.heartbeat) Object.assign(config.heartbeat, updates.heartbeat)

    this.ctx.saveConfig(config)

    const changedKeys = Object.keys(updates)
    this.ctx.broadcastEvent('config.changed', { keys: changedKeys })

    return createSuccessResponse(id, { success: true })
  }

  private handleGetProviderPresets(_params: unknown, id: string) {
    const server = this.ctx.getServer()
    if (!server) {
      return createErrorResponse(id, 'INTERNAL', 'Server not initialized')
    }

    try {
      const presets = server.agent.listPresets()
      return createSuccessResponse(id, presets)
    } catch {
      return createSuccessResponse(id, [])
    }
  }
}
