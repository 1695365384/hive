/**
 * Feishu plugin config helpers
 */

import * as lark from '@larksuiteoapi/node-sdk'
import type { FeishuAppConfig, FeishuConnectionMode } from './types.js'

const PLACEHOLDER_RE = /^(your-|xxx|changeme|placeholder|test_)/i

export function resolveFeishuDomain(domain?: string): typeof lark.Domain.Feishu | typeof lark.Domain.Lark | string {
  if (!domain) return lark.Domain.Feishu
  const normalized = domain.trim().toLowerCase()
  if (normalized === 'lark' || normalized === 'larksuite' || normalized.includes('larksuite.com')) {
    return lark.Domain.Lark
  }
  if (normalized === 'feishu' || normalized.includes('feishu.cn')) {
    return lark.Domain.Feishu
  }
  return domain
}

export function isFeishuAppConfigValid(app: FeishuAppConfig): boolean {
  if (app.enabled === false) return false
  const appId = app.appId?.trim()
  const appSecret = app.appSecret?.trim()
  if (!appId || !appSecret) return false
  if (PLACEHOLDER_RE.test(appId) || PLACEHOLDER_RE.test(appSecret)) return false
  return true
}

export function resolveConnectionMode(
  app: FeishuAppConfig,
  pluginDefault?: FeishuConnectionMode,
): FeishuConnectionMode {
  return app.connectionMode ?? pluginDefault ?? 'websocket'
}
