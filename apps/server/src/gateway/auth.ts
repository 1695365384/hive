/**
 * API Key Authentication Middleware (Hono)
 *
 * Validates requests via Authorization: Bearer <key> header or ?apiKey=<key> query param.
 */

import type { MiddlewareHandler } from 'hono'
import type { ServerConfig } from '../config.js'

/**
 * Create authentication middleware for Hono
 */
export function createAuthMiddleware(config: ServerConfig): MiddlewareHandler {
  const { enabled, apiKey } = config.auth

  return async (c, next) => {
    if (!enabled || !apiKey) {
      await next()
      return
    }

    const authHeader = c.req.header('Authorization')
    const headerKey = extractBearerToken(authHeader)
    const queryKey = c.req.query('apiKey')
    const providedKey = headerKey || queryKey

    if (!providedKey) {
      return c.json({ error: 'Missing API key' }, 401)
    }

    if (providedKey !== apiKey) {
      return c.json({ error: 'Invalid API key' }, 401)
    }

    await next()
  }
}

/**
 * Validate API key for WebSocket upgrade (query param only)
 */
export function validateWsApiKey(config: ServerConfig, apiKey: string | null | undefined): boolean {
  if (!config.auth.enabled || !config.auth.apiKey) {
    return true
  }
  if (!apiKey) {
    return false
  }
  return apiKey === config.auth.apiKey
}

function extractBearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined
  const parts = authHeader.split(' ')
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1]
  }
  return undefined
}
