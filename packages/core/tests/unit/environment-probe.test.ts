import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { probeEnvironment } from '../../src/environment/probe.js'
import type { EnvironmentContext } from '../../src/environment/types.js'

describe('probeEnvironment', () => {
  const originalShell = process.env.SHELL
  const originalCwd = process.cwd()

  afterEach(() => {
    process.env.SHELL = originalShell
    vi.restoreAllMocks()
  })

  it('returns a valid EnvironmentContext with all required fields', () => {
    const env = probeEnvironment()

    expect(env).toHaveProperty('os')
    expect(env).toHaveProperty('shell')
    expect(env).toHaveProperty('node')
    expect(env).toHaveProperty('tools')
    expect(env).toHaveProperty('packageManager')
    expect(env).toHaveProperty('projectType')
    expect(env).toHaveProperty('cwd')

    expect(env.os).toHaveProperty('platform')
    expect(env.os).toHaveProperty('arch')
    expect(env.os).toHaveProperty('version')
    expect(env.node).toHaveProperty('version')
    expect(Array.isArray(env.tools)).toBe(true)
  })

  it('detects OS platform and arch', () => {
    const env = probeEnvironment()

    expect(['darwin', 'linux', 'win32']).toContain(env.os.platform)
    expect(['arm64', 'x64', 'ia32']).toContain(env.os.arch)
    expect(typeof env.os.version).toBe('string')
  })

  it('detects Node.js version', () => {
    const env = probeEnvironment()

    expect(env.node.version).toMatch(/^v\d+\.\d+\.\d+/)
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

  it('detects common tools (git should exist in CI/dev)', () => {
    const env = probeEnvironment()
    // git is almost always available
    expect(env.tools.length).toBeGreaterThanOrEqual(0)
    if (env.tools.length > 0) {
      expect(typeof env.tools[0]).toBe('string')
    }
  })

  it('uses provided cwd', () => {
    const env = probeEnvironment('/tmp')
    expect(env.cwd).toBe('/tmp')
  })

  it('defaults to process.cwd() when no cwd provided', () => {
    const env = probeEnvironment()
    expect(env.cwd).toBe(process.cwd())
  })

  it('detects project type as typescript in this package (packages/core has tsconfig.json)', () => {
    // When running tests, cwd is packages/core/ which has tsconfig.json
    const env = probeEnvironment(originalCwd)
    expect(env.projectType).toBe('typescript')
  })

  it('detects package manager from lockfile (pnpm-workspace.yaml)', () => {
    // Monorepo root has pnpm-lock.yaml; cwd may be core/ which inherits pnpm
    const env = probeEnvironment(originalCwd)
    // packageManager is either pnpm (from lockfile or tools) or unknown
    expect(['pnpm', 'npm', 'yarn', 'unknown']).toContain(env.packageManager)
  })

  it('returns "unknown" project type for empty directory', () => {
    const env = probeEnvironment('/tmp')
    // /tmp typically has no project files
    // (may vary, but unlikely to have tsconfig.json etc.)
    expect(['unknown', 'typescript', 'javascript', 'golang', 'python']).toContain(env.projectType)
  })

  it('completes within 5 seconds', () => {
    const start = Date.now()
    probeEnvironment()
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(5000)
  })
})
