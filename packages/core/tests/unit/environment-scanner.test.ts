import { describe, it, expect } from 'vitest'
import { categorizeTool, getCategoryDictionary } from '../../src/environment/tool-categories.js'
import type { ToolCategory } from '../../src/environment/tool-categories.js'
import { scanPath } from '../../src/environment/scanner.js'

describe('categorizeTool', () => {
  it('categorizes common runtime tools', () => {
    expect(categorizeTool('node', 'darwin')).toBe('runtime')
    expect(categorizeTool('python3', 'linux')).toBe('runtime')
    expect(categorizeTool('go', 'darwin')).toBe('runtime')
  })

  it('categorizes common package managers', () => {
    expect(categorizeTool('pnpm', 'darwin')).toBe('pkgManager')
    expect(categorizeTool('npm', 'linux')).toBe('pkgManager')
    expect(categorizeTool('cargo', 'darwin')).toBe('pkgManager')
  })

  it('categorizes build tools', () => {
    expect(categorizeTool('make', 'darwin')).toBe('buildTool')
    expect(categorizeTool('cmake', 'linux')).toBe('buildTool')
    expect(categorizeTool('gcc', 'linux')).toBe('buildTool')
  })

  it('categorizes container tools', () => {
    expect(categorizeTool('docker', 'darwin')).toBe('container')
    expect(categorizeTool('podman', 'linux')).toBe('container')
  })

  it('categorizes VCS tools', () => {
    expect(categorizeTool('git', 'darwin')).toBe('vcs')
    expect(categorizeTool('hg', 'linux')).toBe('vcs')
  })

  it('categorizes macOS system tools', () => {
    expect(categorizeTool('screencapture', 'darwin')).toBe('system')
    expect(categorizeTool('pbcopy', 'darwin')).toBe('system')
    expect(categorizeTool('osascript', 'darwin')).toBe('system')
    expect(categorizeTool('say', 'darwin')).toBe('system')
  })

  it('categorizes Linux system tools', () => {
    expect(categorizeTool('systemctl', 'linux')).toBe('system')
    expect(categorizeTool('xdg_open', 'linux')).toBe('system')
    expect(categorizeTool('apt', 'linux')).toBe('pkgManager')
  })

  it('categorizes Windows system tools', () => {
    expect(categorizeTool('powershell', 'win32')).toBe('system')
    expect(categorizeTool('clip', 'win32')).toBe('system')
  })

  it('returns "other" for unknown tools', () => {
    expect(categorizeTool('my-custom-tool', 'darwin')).toBe('other')
    expect(categorizeTool('random-script', 'linux')).toBe('other')
    expect(categorizeTool('unknown-binary', 'win32')).toBe('other')
  })

  it('platform-specific overrides common', () => {
    // brew is darwin-specific, should still be found
    expect(categorizeTool('brew', 'darwin')).toBe('pkgManager')
    // brew on linux is unknown (no linux entry for brew)
    expect(categorizeTool('brew', 'linux')).toBe('other')
  })

  it('handles tool names with hyphens', () => {
    // docker-compose is stored as docker_compose in the dictionary
    // but the actual command uses a hyphen — normalizeToolName converts it
    expect(categorizeTool('docker-compose', 'darwin')).toBe('container')
    expect(categorizeTool('notify-send', 'linux')).toBe('system')
    expect(categorizeTool('xdg-open', 'linux')).toBe('system')
  })

  it('handles Windows executables with extensions', () => {
    // .exe extension should be stripped during normalization
    expect(categorizeTool('git.exe', 'win32')).toBe('vcs')
    expect(categorizeTool('python3.exe', 'win32')).toBe('runtime')
  })
})

describe('getCategoryDictionary', () => {
  it('returns combined common + platform dictionary', () => {
    const dict = getCategoryDictionary('darwin')
    // Should have common tools
    expect(dict['git']).toBe('vcs')
    expect(dict['node']).toBe('runtime')
    // Should have platform-specific tools
    expect(dict['screencapture']).toBe('system')
    expect(dict['brew']).toBe('pkgManager')
  })

  it('returns common + linux for linux platform', () => {
    const dict = getCategoryDictionary('linux')
    expect(dict['git']).toBe('vcs')
    expect(dict['systemctl']).toBe('system')
    expect(dict['apt']).toBe('pkgManager')
  })

  it('returns common only for unknown platform', () => {
    const dict = getCategoryDictionary('unknown')
    expect(dict['git']).toBe('vcs')
    expect(dict).not.toHaveProperty('screencapture')
    expect(dict).not.toHaveProperty('systemctl')
  })
})

describe('scanPath (integration)', () => {
  it('returns an array of ScannedTool with correct shape', async () => {
    const tools = await scanPath()
    expect(Array.isArray(tools)).toBe(true)

    for (const tool of tools) {
      expect(tool).toHaveProperty('name')
      expect(tool).toHaveProperty('category')
      expect(tool).toHaveProperty('version')
      expect(tool).toHaveProperty('path')
      expect(typeof tool.name).toBe('string')
      expect(typeof tool.path).toBe('string')
      expect(['runtime', 'pkgManager', 'buildTool', 'container', 'vcs', 'system', 'native-app', 'other'])
        .toContain(tool.category)
    }
  })

  it('finds common tools on the current system', async () => {
    const tools = await scanPath()
    const names = new Set(tools.map(t => t.name))

    // These tools should exist on any macOS dev machine
    if (process.platform === 'darwin') {
      expect(names.has('git')).toBe(true)
      expect(names.has('node')).toBe(true)
    }
  })

  it('does not have duplicate tool names', async () => {
    const tools = await scanPath()
    const names = tools.map(t => t.name)
    const uniqueNames = new Set(names)
    expect(names.length).toBe(uniqueNames.size)
  })

  it('detects versions for known tools (not "other" category)', async () => {
    const tools = await scanPath()
    const gitTool = tools.find(t => t.name === 'git')

    if (gitTool) {
      // git should have a version detected
      expect(gitTool.version).not.toBeNull()
    }
  })
})
