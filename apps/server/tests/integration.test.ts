/**
 * Integration tests for Hive Server
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, ChildProcess } from 'child_process'
import { resolve } from 'path'
import { createServer } from 'node:net'

const CLI_PATH = resolve(__dirname, '../dist/cli/index.js')
let PORT: number
let BASE_URL: string

let serverProcess: ChildProcess | null = null

function getFreePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer()
    s.listen(0, () => {
      const p = (s.address() as { port: number }).port
      s.close(() => res(p))
    })
    s.on('error', rej)
  })
}

async function waitForServer(url: string, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return true
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

describe('Hive Server Integration', () => {
  beforeAll(async () => {
    PORT = await getFreePort()
    BASE_URL = `http://localhost:${PORT}`

    serverProcess = spawn('node', [CLI_PATH, 'server', '--port', String(PORT)], {
      cwd: resolve(__dirname, '..'),
      env: { ...process.env, PORT: String(PORT), PLUGINS: '' },
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
    it('should return response (dispatch may succeed or fail without provider)', async () => {
      const response = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello' }),
      })

      expect([200, 500]).toContain(response.status)

      const data = await response.json()
      if (response.status === 200) {
        expect(data).toHaveProperty('response')
        expect(data).toHaveProperty('sessionId')
      }
    }, 15000)
  })

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await fetch(`${BASE_URL}/unknown-route`)
      expect(response.status).toBe(404)
    })
  })
})
