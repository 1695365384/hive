/**
 * StatusHandler — 服务状态域
 *
 * status.get / server.restart / server.getProviders / provider.list / provider.getModels
 */

import type { HandlerContext, MethodHandler } from '../handler-context.js'
import { WsDomainHandler } from './base.js'
import type { ServerStatus } from '../data-types.js'
import { createSuccessResponse, createErrorResponse } from '../types.js'
import type { Server as HttpServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HIVE_HOME } from '../../../config.js'

export class StatusHandler extends WsDomainHandler {
  private startTime: number
  private httpServer: HttpServer | null = null

  constructor(ctx: HandlerContext, startTime: number) {
    super(ctx)
    this.startTime = startTime
  }

  setHttpServer(httpServer: HttpServer | null): void {
    this.httpServer = httpServer
  }

  register(): Map<string, MethodHandler> {
    return new Map<string, MethodHandler>([
      ['status.get', this.handleStatusGet.bind(this)],
      ['server.restart', this.handleServerRestart.bind(this)],
      ['server.getProviders', this.handleGetProviders.bind(this)],
      ['provider.list', this.handleProviderList.bind(this)],
      ['provider.getModels', this.handleProviderGetModels.bind(this)],
    ])
  }

  private handleStatusGet(_params: unknown, id: string) {
    const server = this.ctx.getServer()
    const provider = server?.agent?.currentProvider
    const providerReady = !!provider?.apiKey && provider.apiKey.length > 0

    const status: ServerStatus = {
      server: {
        state: 'running',
        port: this.getPort(),
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        version: this.getVersion(),
      },
      agent: {
        initialized: !!server,
        providerReady,
        currentProvider: provider?.id ?? null,
        activePlugins: [],
      },
      system: {
        memory: {
          rss: process.memoryUsage().rss,
          heapUsed: process.memoryUsage().heapUsed,
          heapTotal: process.memoryUsage().heapTotal,
        },
        nodeVersion: process.version,
        platform: `${process.platform} ${process.arch}`,
      },
    }

    return createSuccessResponse(id, status)
  }

  private handleServerRestart(_params: unknown, id: string) {
    const response = createSuccessResponse(id, { success: true })

    this.ctx.broadcastEvent('server.shutting_down', { reason: 'restart' })

    setTimeout(() => {
      process.exit(0)
    }, 300)

    return response
  }

  private handleGetProviders(_params: unknown, id: string) {
    const server = this.ctx.getServer()
    if (!server) {
      return createErrorResponse(id, 'INTERNAL', 'Server not initialized')
    }

    const providers = server.agent.listProviders()
    return createSuccessResponse(id, providers)
  }

  private async handleProviderList(_params: unknown, id: string) {
    const server = this.ctx.getServer()
    if (!server) {
      return createErrorResponse(id, 'INTERNAL', 'Server not initialized')
    }

    try {
      const providers = await server.agent.listAllProviders()
      return createSuccessResponse(id, providers.map(p => ({
        id: p.id,
        name: p.name,
        logo: p.logo,
        type: p.type,
        defaultModel: p.models.length > 0 ? p.models[0].id : undefined,
        modelCount: p.models.length,
      })))
    } catch (error) {
      return createErrorResponse(id, 'INTERNAL', error instanceof Error ? error.message : 'Failed to list providers')
    }
  }

  private async handleProviderGetModels(params: unknown, id: string) {
    const { providerId } = params as { providerId: string }
    if (!providerId) {
      return createErrorResponse(id, 'VALIDATION', 'providerId is required')
    }

    const server = this.ctx.getServer()
    if (!server) {
      return createErrorResponse(id, 'INTERNAL', 'Server not initialized')
    }

    try {
      const models = await server.agent.listProviderModels(providerId)
      return createSuccessResponse(id, models.map(m => ({
        id: m.id,
        name: m.name,
        family: m.family,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
      })))
    } catch (error) {
      return createErrorResponse(id, 'INTERNAL', error instanceof Error ? error.message : 'Failed to get models')
    }
  }

  private getPort(): number {
    if (this.httpServer) {
      const addr = this.httpServer.address()
      if (typeof addr === 'object' && addr) return addr.port
    }
    return 4450
  }

  private getVersion(): string {
    try {
      const pkg = JSON.parse(readFileSync(resolve(HIVE_HOME, 'package.json'), 'utf-8'))
      return pkg.version ?? '0.0.0'
    } catch {
      return '0.0.0'
    }
  }
}
