import { describe, it, expect, vi, afterEach } from 'vitest'
import { probeEnvironment } from '../../src/environment/probe.js'
import type { EnvironmentContext } from '../../src/environment/types.js'

describe('probeEnvironment', () => {
  const originalShell = process.env.SHELL

  afterEach(() => {
    process.env.SHELL = originalShell
    vi.restoreAllMocks()
  })

  it('returns a valid EnvironmentContext with all required fields', () => {
    const env = probeEnvironment()

    expect(env).toHaveProperty('os')
    expect(env).toHaveProperty('shell')
    expect(env).toHaveProperty('node')
    expect(env).toHaveProperty('cpu')
    expect(env).toHaveProperty('memory')
    expect(env).toHaveProperty('cwd')
    expect(env).toHaveProperty('timezone')
    expect(env).toHaveProperty('locale')

    expect(env.os).toHaveProperty('platform')
    expect(env.os).toHaveProperty('arch')
    expect(env.os).toHaveProperty('version')
    expect(env.os).toHaveProperty('displayName')
    expect(env.node).toHaveProperty('version')
    expect(env.cpu).toHaveProperty('model')
    expect(env.cpu).toHaveProperty('cores')
    expect(env.memory).toHaveProperty('totalGb')
  })

  it('detects timezone', () => {
    const env = probeEnvironment()

    expect(env.timezone).toHaveProperty('name')
    expect(env.timezone).toHaveProperty('utcOffset')
    expect(typeof env.timezone.name).toBe('string')
    expect(env.timezone.name.length).toBeGreaterThan(0)
    expect(env.timezone.utcOffset).toMatch(/^UTC[+-]\d{2}:\d{2}$/)
  })

  it('detects locale', () => {
    const env = probeEnvironment()

    expect(env.locale).toHaveProperty('system')
    expect(env.locale).toHaveProperty('language')
    expect(typeof env.locale.language).toBe('string')
    expect(env.locale.language.length).toBeGreaterThan(0)
  })

  it('detects OS platform and arch', () => {
    const env = probeEnvironment()

    expect(['darwin', 'linux', 'win32']).toContain(env.os.platform)
    expect(['arm64', 'x64', 'ia32']).toContain(env.os.arch)
    expect(typeof env.os.version).toBe('string')
  })

  it('generates human-readable OS displayName', () => {
    const env = probeEnvironment()

    expect(typeof env.os.displayName).toBe('string')
    expect(env.os.displayName.length).toBeGreaterThan(0)

    // displayName should not contain the raw kernel version
    expect(env.os.displayName).not.toContain(env.os.version)
  })

  it('includes platform name in displayName', () => {
    const env = probeEnvironment()

    if (env.os.platform === 'darwin') {
      expect(env.os.displayName).toContain('macOS')
    } else if (env.os.platform === 'linux') {
      expect(env.os.displayName).toContain('Linux')
    } else if (env.os.platform === 'win32') {
      expect(env.os.displayName).toContain('Windows')
    }
  })

  it('detects Node.js version', () => {
    const env = probeEnvironment()

    expect(env.node.version).toMatch(/^v\d+\.\d+\.\d+/)
  })

  it('detects CPU info', () => {
    const env = probeEnvironment()

    expect(typeof env.cpu.model).toBe('string')
    expect(env.cpu.model.length).toBeGreaterThan(0)
    expect(typeof env.cpu.cores).toBe('number')
    expect(env.cpu.cores).toBeGreaterThan(0)
  })

  it('detects memory info', () => {
    const env = probeEnvironment()

    expect(typeof env.memory.totalGb).toBe('number')
    expect(env.memory.totalGb).toBeGreaterThan(0)
  })

  it('detects shell from SHELL env var', () => {
    process.env.SHELL = '/bin/zsh'
    const env = probeEnvironment()
    expect(env.shell).toBe('zsh')
  })

  it('detects shell from deep path', () => {
    process.env.SHELL = '/usr/local/bin/fish'
    const env = probeEnvironment()
    expect(env.shell).toBe('fish')
  })

  it('returns "unknown" when SHELL is not set', () => {
    delete process.env.SHELL
    const env = probeEnvironment()
    expect(env.shell).toBe('unknown')
  })

  it('does NOT have tools/packageManager/projectType fields', () => {
    const env = probeEnvironment() as Record<string, unknown>

    expect(env).not.toHaveProperty('tools')
    expect(env).not.toHaveProperty('packageManager')
    expect(env).not.toHaveProperty('projectType')
  })

  it('uses provided cwd', () => {
    const env = probeEnvironment('/tmp')
    expect(env.cwd).toBe('/tmp')
  })

  it('defaults to process.cwd() when no cwd provided', () => {
    const env = probeEnvironment()
    expect(env.cwd).toBe(process.cwd())
  })

  it('completes within 10ms (os module only, no external commands)', () => {
    const start = Date.now()
    probeEnvironment()
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(10)
  })
})
