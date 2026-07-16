/**
 * MCP catalog loader + enable policy helpers (server)
 */

import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadMcpCatalog,
  findCatalogEntry,
  toPublicCatalogEntry,
} from '../../src/mcp-catalog.js'

const catalogPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../mcp-catalog.json',
)

describe('mcp-catalog', () => {
  it('loads repo catalog with officecli builtin', () => {
    const catalog = loadMcpCatalog(catalogPath)
    expect(catalog.entries.length).toBeGreaterThanOrEqual(1)
    const office = findCatalogEntry('officecli', catalog)
    expect(office?.builtin).toBe(true)
    expect(office?.status).toBe('live')
  })

  it('strips config from public entry', () => {
    const publicEntry = toPublicCatalogEntry({
      id: 'x',
      title: 'X',
      description: '',
      region: 'cn',
      status: 'live',
      builtin: false,
      transport: 'http',
      config: { transport: 'http', url: 'https://secret.example/mcp' },
    })
    expect(publicEntry).not.toHaveProperty('config')
  })

  it('comingSoon entries exist as placeholders', () => {
    const catalog = loadMcpCatalog(catalogPath)
    const soon = catalog.entries.filter((e) => e.status === 'comingSoon')
    expect(soon.length).toBeGreaterThanOrEqual(1)
  })
})
