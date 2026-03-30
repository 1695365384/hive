import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * scanPluginDir 适配测试
 *
 * scanPluginDir 是 plugins.ts 的内部函数，通过 loadPlugins 间接测试。
 * 这里直接测试其核心逻辑：resolveManifest 的两种目录结构识别。
 */

// 测试 resolveManifest 的核心逻辑（从 plugins.ts 提取的模式）
function resolveManifest(
  pluginDir: string,
  dirName: string,
  fs: { existsSync: (p: string) => boolean; readFileSync: (p: string) => string; readdirSync: (p: string) => Array<{ name: string; isDirectory: () => boolean }> },
): { dir: string; name: string; entry: string } | null {
  // 1. 直接 package.json
  const directPkgPath = `${pluginDir}/package.json`
  if (fs.existsSync(directPkgPath)) {
    const pkgJson = JSON.parse(fs.readFileSync(directPkgPath))
    if (pkgJson.hive?.plugin) {
      const entryFile = pkgJson.hive.entry ?? 'dist/index.js'
      return { dir: pluginDir, name: pkgJson.name ?? dirName, entry: `${pluginDir}/${entryFile}` }
    }
  }

  // 2. node_modules 下查找
  const nmDir = `${pluginDir}/node_modules`
  if (!fs.existsSync(nmDir)) return null

  const nmEntries = fs.readdirSync(nmDir)
  for (const nmEntry of nmEntries) {
    if (!nmEntry.isDirectory()) continue

    if (nmEntry.name.startsWith('@')) {
      const scopeDir = `${nmDir}/${nmEntry.name}`
      const scopeEntries = fs.readdirSync(scopeDir)
      for (const scopeEntry of scopeEntries) {
        if (!scopeEntry.isDirectory()) continue
        const pkgJsonPath = `${scopeDir}/${scopeEntry.name}/package.json`
        if (fs.existsSync(pkgJsonPath)) {
          const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath))
          if (pkgJson.hive?.plugin) {
            const entryFile = pkgJson.hive.entry ?? 'dist/index.js'
            return { dir: pluginDir, name: pkgJson.name ?? dirName, entry: `${scopeDir}/${scopeEntry.name}/${entryFile}` }
          }
        }
      }
    } else {
      const pkgJsonPath = `${nmDir}/${nmEntry.name}/package.json`
      if (fs.existsSync(pkgJsonPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath))
        if (pkgJson.hive?.plugin) {
          const entryFile = pkgJson.hive.entry ?? 'dist/index.js'
          return { dir: pluginDir, name: pkgJson.name ?? dirName, entry: `${nmDir}/${nmEntry.name}/${entryFile}` }
        }
      }
    }
  }

  return null
}

// Mock fs helpers
function createMockFs(overrides: Record<string, string> = {}, dirs: string[] = []) {
  const files: Record<string, string> = {
    ...overrides,
  }

  return {
    existsSync: (p: string) => p in files || dirs.includes(p),
    readFileSync: (p: string) => files[p] ?? '{}',
    readdirSync: (p: string) => {
      // Simulate directory listing based on registered entries
      const entries: Array<{ name: string; isDirectory: () => boolean }> = []
      for (const key of Object.keys(files)) {
        if (key.startsWith(p + '/')) {
          const rest = key.slice(p.length + 1).split('/')[0]
          if (rest && !entries.find(e => e.name === rest)) {
            entries.push({ name: rest, isDirectory: () => !rest.includes('.') })
          }
        }
      }
      // Add directories
      for (const dir of dirs) {
        if (dir.startsWith(p + '/')) {
          const rest = dir.slice(p.length + 1).split('/')[0]
          if (rest && !entries.find(e => e.name === rest)) {
            entries.push({ name: rest, isDirectory: () => true })
          }
        }
      }
      return entries
    },
  }
}

describe('resolveManifest — 直接 package.json', () => {
  it('finds plugin from direct package.json with hive.plugin', () => {
    const mockFs = createMockFs({
      '/tmp/hive/plugins/feishu/package.json': JSON.stringify({
        name: '@bundy-lmw/hive-plugin-feishu',
        version: '1.0.0',
        hive: { plugin: true, entry: 'dist/index.js' },
      }),
    })

    const result = resolveManifest('/tmp/hive/plugins/feishu', 'feishu', mockFs)

    expect(result).not.toBeNull()
    expect(result!.name).toBe('@bundy-lmw/hive-plugin-feishu')
    expect(result!.entry).toContain('dist/index.js')
  })

  it('returns null when package.json exists but no hive.plugin', () => {
    const mockFs = createMockFs({
      '/tmp/hive/plugins/feishu/package.json': JSON.stringify({
        name: 'some-package',
        version: '1.0.0',
      }),
    })

    const result = resolveManifest('/tmp/hive/plugins/feishu', 'feishu', mockFs)

    expect(result).toBeNull()
  })

  it('returns null when no package.json', () => {
    const mockFs = createMockFs()

    const result = resolveManifest('/tmp/hive/plugins/feishu', 'feishu', mockFs)

    expect(result).toBeNull()
  })

  it('uses default entry when hive.entry is not specified', () => {
    const mockFs = createMockFs({
      '/tmp/hive/plugins/feishu/package.json': JSON.stringify({
        name: '@bundy-lmw/hive-plugin-feishu',
        hive: { plugin: true },
      }),
    })

    const result = resolveManifest('/tmp/hive/plugins/feishu', 'feishu', mockFs)

    expect(result!.entry).toContain('dist/index.js')
  })
})

describe('resolveManifest — npm --prefix 安装（node_modules）', () => {
  it('finds plugin in node_modules/pkg', () => {
    const entries: Array<{ name: string; isDirectory: () => boolean }> = []
    const readdirMock = vi.fn((p: string) => {
      entries.length = 0
      if (p === '/tmp/hive/plugins/feishu/node_modules') {
        entries.push({ name: '@bundy-lmw', isDirectory: () => true })
      } else if (p === '/tmp/hive/plugins/feishu/node_modules/@bundy-lmw') {
        entries.push({ name: 'hive-plugin-feishu', isDirectory: () => true })
      }
      return entries
    })

    const mockFs = {
      existsSync: (p: string) => p === '/tmp/hive/plugins/feishu/node_modules' ||
        p === '/tmp/hive/plugins/feishu/node_modules/@bundy-lmw' ||
        p === '/tmp/hive/plugins/feishu/node_modules/@bundy-lmw/hive-plugin-feishu/package.json',
      readFileSync: (p: string) => JSON.stringify({
        name: '@bundy-lmw/hive-plugin-feishu',
        version: '1.0.0',
        hive: { plugin: true, entry: 'dist/index.js' },
      }),
      readdirSync: readdirMock,
    }

    const result = resolveManifest('/tmp/hive/plugins/feishu', 'feishu', mockFs)

    expect(result).not.toBeNull()
    expect(result!.name).toBe('@bundy-lmw/hive-plugin-feishu')
    expect(result!.entry).toContain('node_modules/@bundy-lmw/hive-plugin-feishu')
  })

  it('finds plugin in node_modules/pkg (no scope)', () => {
    const mockFs = createMockFs(
      {
        '/tmp/hive/plugins/custom/node_modules/hive-plugin-custom/package.json': JSON.stringify({
          name: 'hive-plugin-custom',
          version: '1.0.0',
          hive: { plugin: true },
        }),
      },
      ['/tmp/hive/plugins/custom/node_modules'],
    )

    const result = resolveManifest('/tmp/hive/plugins/custom', 'custom', mockFs)

    expect(result).not.toBeNull()
    expect(result!.name).toBe('hive-plugin-custom')
  })

  it('prefers direct package.json over node_modules', () => {
    const mockFs = createMockFs({
      '/tmp/hive/plugins/feishu/package.json': JSON.stringify({
        name: 'local-feishu',
        version: '2.0.0',
        hive: { plugin: true },
      }),
      '/tmp/hive/plugins/feishu/node_modules/@bundy-lmw/hive-plugin-feishu/package.json': JSON.stringify({
        name: '@bundy-lmw/hive-plugin-feishu',
        version: '1.0.0',
        hive: { plugin: true },
      }),
    })

    const result = resolveManifest('/tmp/hive/plugins/feishu', 'feishu', mockFs)

    // Direct takes priority
    expect(result!.name).toBe('local-feishu')
    expect(result!.entry).not.toContain('node_modules')
  })

  it('returns null when node_modules has no valid plugin', () => {
    const mockFs = createMockFs(
      {
        '/tmp/hive/plugins/feishu/node_modules/some-lib/package.json': JSON.stringify({
          name: 'some-lib',
          version: '1.0.0',
        }),
      },
      ['/tmp/hive/plugins/feishu/node_modules'],
    )

    const result = resolveManifest('/tmp/hive/plugins/feishu', 'feishu', mockFs)

    expect(result).toBeNull()
  })
})
