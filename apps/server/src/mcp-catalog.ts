/**
 * MCP Catalog — 仓库内 allowlist
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { McpServerConfig } from '@bundy-lmw/hive-core'

export type McpCatalogStatus = 'live' | 'comingSoon'

export type McpCatalogEntry = {
  id: string
  title: string
  description: string
  region: string
  status: McpCatalogStatus
  builtin: boolean
  transport: 'stdio' | 'http'
  /** 仅 server 侧 enable 使用；catalog API 不下发敏感字段时可剥离 */
  config?: McpServerConfig
}

export type McpCatalogFile = {
  version: number
  title: string
  description: string
  entries: McpCatalogEntry[]
}

function defaultCatalogPath(): string {
  // dist: apps/server/dist/... → ../../mcp-catalog.json
  // src via tsx: apps/server/src/... → ../mcp-catalog.json
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(here, 'mcp-catalog.json'), // dist/ copy
    path.resolve(here, '../mcp-catalog.json'), // dist/ → apps/server/
    path.resolve(process.cwd(), 'mcp-catalog.json'),
    path.resolve(process.cwd(), 'apps/server/mcp-catalog.json'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0]
}

export function loadMcpCatalog(catalogPath = defaultCatalogPath()): McpCatalogFile {
  if (!fs.existsSync(catalogPath)) {
    return {
      version: 1,
      title: 'Hive MCP Catalog',
      description: '',
      entries: [],
    }
  }
  const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf-8')) as McpCatalogFile
  return {
    version: raw.version ?? 1,
    title: raw.title ?? 'Hive MCP Catalog',
    description: raw.description ?? '',
    entries: Array.isArray(raw.entries) ? raw.entries : [],
  }
}

export function findCatalogEntry(id: string, catalog = loadMcpCatalog()): McpCatalogEntry | undefined {
  return catalog.entries.find((e) => e.id === id)
}

/** 给 Desktop 的安全视图：去掉可执行 config */
export function toPublicCatalogEntry(entry: McpCatalogEntry) {
  const { config: _config, ...rest } = entry
  return rest
}
