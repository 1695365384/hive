/**
 * Environment Context Types
 *
 * Structured system environment information collected at startup
 * and injected into Agent system prompts.
 */

export interface EnvironmentContext {
  /** Operating system information */
  os: {
    /** os.platform(): 'darwin' | 'linux' | 'win32' */
    platform: string
    /** os.arch(): 'arm64' | 'x64' */
    arch: string
    /** os.release() */
    version: string
  }
  /** Shell type: 'zsh' | 'bash' | 'fish' | 'sh' | 'unknown' */
  shell: string
  /** Node.js version (e.g. 'v20.11.0') */
  node: {
    version: string
  }
  /** Available tools detected in PATH */
  tools: string[]
  /** Package manager: 'pnpm' | 'npm' | 'yarn' | 'unknown' */
  packageManager: string
  /** Project type: 'typescript' | 'javascript' | 'golang' | 'python' | 'unknown' */
  projectType: string
  /** Current working directory */
  cwd: string
}
