import { describe, it, expect } from 'vitest'
import { scanNativeApps } from '../../src/environment/native-app-scanner.js'

describe('scanNativeApps — dynamic discovery', () => {
  it('returns empty array for unsupported platform', async () => {
    const apps = await scanNativeApps('freebsd')
    expect(apps).toEqual([])
  })

  it('returns empty array for unknown platform', async () => {
    const apps = await scanNativeApps('haiku')
    expect(apps).toEqual([])
  })

  it('returns results with correct shape on current platform', async () => {
    const apps = await scanNativeApps()
    expect(Array.isArray(apps)).toBe(true)

    for (const app of apps) {
      expect(app).toHaveProperty('name')
      expect(app).toHaveProperty('category')
      expect(app).toHaveProperty('version')
      expect(app).toHaveProperty('path')
      expect(typeof app.name).toBe('string')
      expect(app.name.length).toBeGreaterThan(0)
      expect(app.category).toBe('native-app')
      expect(app.version).toBeNull()
      expect(typeof app.path).toBe('string')
      expect(app.path.length).toBeGreaterThan(0)
    }
  })

  it('does not have duplicate app names', async () => {
    const apps = await scanNativeApps()
    const names = apps.map(a => a.name)
    const uniqueNames = new Set(names)
    expect(names.length).toBe(uniqueNames.size)
  })

  it('respects MAX_APPS limit', async () => {
    const apps = await scanNativeApps()
    expect(apps.length).toBeLessThanOrEqual(200)
  })

  describe('macOS discovery', () => {
    it('discovers apps from /Applications on darwin', async () => {
      const apps = await scanNativeApps('darwin')
      // On any macOS system, /Applications should have at least a few apps
      if (process.platform === 'darwin') {
        expect(apps.length).toBeGreaterThan(0)
      }
    })

    it('generates correct osascript access commands', async () => {
      const apps = await scanNativeApps('darwin')
      for (const app of apps) {
        expect(app.path).toContain('osascript')
        expect(app.path).toContain(`"${app.name}"`)
      }
    })

    it('extracts app names without .app suffix', async () => {
      const apps = await scanNativeApps('darwin')
      for (const app of apps) {
        expect(app.name).not.toContain('.app')
      }
    })
  })

  describe('access command templates', () => {
    it('macOS uses osascript template', async () => {
      const apps = await scanNativeApps('darwin')
      if (apps.length > 0) {
        expect(apps[0].path).toMatch(/^osascript -e 'tell application "/)
      }
    })

    it('Windows uses start template', async () => {
      // TODO: Discovery logic cannot be fully tested on non-Windows platforms.
      // On macOS/Linux, Start Menu dirs don't exist so results may be empty.
      const apps = await scanNativeApps('win32')
      for (const app of apps) {
        expect(app.path).toContain('start')
      }
    })

    it('Linux uses gio launch or direct command', async () => {
      // TODO: Discovery logic cannot be fully tested on non-Linux platforms.
      const apps = await scanNativeApps('linux')
      for (const app of apps) {
        expect(app.path).toMatch(/gio launch|\.desktop/)
      }
    })
  })
})
