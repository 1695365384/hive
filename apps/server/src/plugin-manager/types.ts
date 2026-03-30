/**
 * Plugin Distribution Types
 */

/** 安装来源类型 */
export type SourceType = 'npm' | 'git' | 'local'

/** 安装来源 */
export interface PluginSource {
  /** 来源类型 */
  type: SourceType
  /** 原始输入 */
  raw: string
  /** 解析后的包名 / URL / 路径 */
  resolved: string
  /** 安装目标目录名 */
  targetName: string
}

/** 注册表中的插件记录 */
export interface RegistryEntry {
  /** 来源（如 npm:@bundy-lmw/hive-plugin-feishu@1.0.0） */
  source: string
  /** 安装时间 ISO string */
  installedAt: string
  /** 解析出的版本 */
  resolvedVersion: string
}

/** 注册表结构 */
export type PluginRegistry = Record<string, RegistryEntry>

/** npm Registry 搜索结果中的包信息 */
export interface NpmSearchPackage {
  name: string
  version: string
  description?: string
  links?: {
    npm?: string
    homepage?: string
    repository?: string
  }
}

/** npm Registry 搜索 API 响应 */
export interface NpmSearchResponse {
  objects: Array<{
    package: NpmSearchPackage
    score: {
      final: number
      detail: {
        popularity: number
        quality: number
        maintenance: number
      }
    }
  }>
  total: number
}

/** 安装结果 */
export interface InstallResult {
  success: boolean
  name: string
  packageName?: string
  version?: string
  error?: string
}

/** 插件详情（info 命令输出） */
export interface PluginInfo {
  name: string
  version: string
  source: string
  installedAt: string
  description?: string
  homepage?: string
  config?: Record<string, unknown>
}
