/**
 * Integration tests for Hive Server
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, ChildProcess } from 'child_process'
import { resolve } from 'path'

const CLI_PATH = resolve(__dirname, '../dist/cli/index.js')
const BASE_URL = 'http://localhost:3001'

let serverProcess: ChildProcess | null = null

async function waitForServer(url: string, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url)
      if (response.ok) return true
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

describe('Hive Server Integration', () => {
  beforeAll(async () => {
    // Start server on port 3001
    serverProcess = spawn('node', [CLI_PATH, 'server', '--port', '3001'], {
      cwd: resolve(__dirname, '..'),
      env: { ...process.env, PORT: '3001', PLUGINS: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const ready = await waitForServer(`${BASE_URL}/health`)
    if (!ready) {
      throw new Error('Server failed to start')
    }
  }, 10000)

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill()
      serverProcess = null
    }
  })

  describe('Health Endpoint', () => {
    it('should return ok status', async () => {
      const response = await fetch(`${BASE_URL}/health`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toHaveProperty('status', 'ok')
      expect(data).toHaveProperty('timestamp')
    })
  })

  describe('Plugins Endpoint', () => {
    it('should return empty plugins list', async () => {
      const response = await fetch(`${BASE_URL}/api/plugins`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toHaveProperty('plugins')
      expect(Array.isArray(data.plugins)).toBe(true)
    })
  })

  describe('Sessions Endpoint', () => {
    it('should return empty sessions list', async () => {
      const response = await fetch(`${BASE_URL}/api/sessions`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data).toHaveProperty('sessions')
      expect(Array.isArray(data.sessions)).toBe(true)
    })
  })

  describe('Chat Endpoint', () => {
    it('should return error when no API key configured', async () => {
      const response = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' }),
      })

      // Without valid API key, expect error response
      expect(response.status).toBeGreaterThanOrEqual(400)
    })
  })

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await fetch(`${BASE_URL}/unknown-route`)
      expect(response.status).toBe(404)
    })
  })
})
