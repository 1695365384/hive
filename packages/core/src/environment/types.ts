/**
 * Environment Context Types
 *
 * Structured system environment information collected at startup.
 * Phase 1 (sync): basic OS/Shell/Node/CPU/Memory info injected into prompts.
 * Phase 2 (async): full PATH scan stored in SQLite, queried via built-in tool.
 */

export interface EnvironmentContext {
  /** Operating system information */
  os: {
    /** os.platform(): 'darwin' | 'linux' | 'win32' */
    platform: string
    /** os.arch(): 'arm64' | 'x64' */
    arch: string
    /** os.release(): kernel version */
    version: string
    /** Human-readable OS name, e.g. 'macOS 15.5 Sequoia' */
    displayName: string
  }
  /** Shell type: 'zsh' | 'bash' | 'fish' | 'sh' | 'unknown' */
  shell: string
  /** Node.js version (e.g. 'v22.20.0') */
  node: {
    version: string
  }
  /** CPU information */
  cpu: {
    /** CPU model name (e.g. 'Apple M4') */
    model: string
    /** Total logical cores */
    cores: number
  }
  /** Memory information */
  memory: {
    /** Total RAM in GB */
    totalGb: number
  }
  /** Current working directory */
  cwd: string
}
