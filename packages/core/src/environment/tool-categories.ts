/**
 * Tool Classification Dictionary
 *
 * Maps executable names to categories. Used during PATH scanning
 * to classify tools into meaningful groups for Agent queries.
 */

/** Tool category types */
export type ToolCategory =
  | 'runtime'
  | 'pkgManager'
  | 'buildTool'
  | 'container'
  | 'vcs'
  | 'system'
  | 'native-app'
  | 'other'

/**
 * Cross-platform tool category mapping.
 *
 * Structure: platform → tool name (underscores → actual names) → category
 * Tool names use underscores where the actual command uses hyphens
 * (e.g., 'docker_compose' → 'docker-compose').
 */
const TOOL_CATEGORIES: Record<string, Record<string, ToolCategory>> = {
  // Cross-platform tools
  common: {
    // Runtimes
    node: 'runtime',
    deno: 'runtime',
    bun: 'runtime',
    python3: 'runtime',
    python: 'runtime',
    ruby: 'runtime',
    go: 'runtime',
    java: 'runtime',
    javac: 'runtime',
    rustc: 'runtime',
    swift: 'runtime',
    dotnet: 'runtime',

    // Package Managers
    pnpm: 'pkgManager',
    npm: 'pkgManager',
    yarn: 'pkgManager',
    pip3: 'pkgManager',
    pip: 'pkgManager',
    cargo: 'pkgManager',
    gem: 'pkgManager',
    composer: 'pkgManager',

    // Build Tools
    make: 'buildTool',
    cmake: 'buildTool',
    gradle: 'buildTool',
    gcc: 'buildTool',
    'g++': 'buildTool',
    clang: 'buildTool',
    'clang++': 'buildTool',
    swiftc: 'buildTool',
    xcodebuild: 'buildTool',

    // Containers
    docker: 'container',
    'docker_compose': 'container',
    'docker_compose_v2': 'container',
    podman: 'container',
    colima: 'container',

    // VCS
    git: 'vcs',
    hg: 'vcs',
    svn: 'vcs',
  },

  // macOS system tools
  darwin: {
    brew: 'pkgManager',
    screencapture: 'system',
    pbcopy: 'system',
    pbpaste: 'system',
    open: 'system',
    osascript: 'system',
    say: 'system',
    diskutil: 'system',
    caffeinate: 'system',
    pmset: 'system',
    mdfind: 'system',
    lsof: 'system',
    launchctl: 'system',
    plutil: 'system',
    'sw_vers': 'system',
    security: 'system',
  },

  // Linux system tools
  linux: {
    apt: 'pkgManager',
    dnf: 'pkgManager',
    snap: 'pkgManager',
    'xdg_open': 'system',
    xclip: 'system',
    xsel: 'system',
    systemctl: 'system',
    'notify_send': 'system',
    scrot: 'system',
    journalctl: 'system',
    cron: 'system',
  },

  // Windows system tools
  win32: {
    clip: 'system',
    start: 'system',
    powershell: 'system',
    tasklist: 'system',
    netsh: 'system',
  },
}

/**
 * Normalize a tool name for dictionary lookup.
 * Converts hyphens to underscores (e.g., 'docker-compose' → 'docker_compose').
 * Strips common extensions on Windows (.exe, .bat, .cmd, .ps1).
 */
function normalizeToolName(name: string): string {
  let normalized = name.replace(/\.exe$/i, '').replace(/\.bat$/i, '')
    .replace(/\.cmd$/i, '').replace(/\.ps1$/i, '');
  return normalized.replace(/-/g, '_');
}

/**
 * Categorize a tool by name and platform.
 *
 * Lookup order: platform-specific dict → common dict → 'other'
 */
export function categorizeTool(name: string, platform: string): ToolCategory {
  const normalized = normalizeToolName(name);

  // Check platform-specific dictionary first
  const platformDict = TOOL_CATEGORIES[platform];
  if (platformDict && normalized in platformDict) {
    return platformDict[normalized];
  }

  // Fall back to common dictionary
  if (normalized in TOOL_CATEGORIES.common) {
    return TOOL_CATEGORIES.common[normalized];
  }

  return 'other';
}

/**
 * Get all known tool entries for a given platform.
 * Useful for testing and documentation.
 */
export function getCategoryDictionary(
  platform: string,
): Record<string, ToolCategory> {
  const platformDict = TOOL_CATEGORIES[platform] ?? {};
  return { ...TOOL_CATEGORIES.common, ...platformDict };
}

