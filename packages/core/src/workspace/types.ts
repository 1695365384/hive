/**
 * 工作空间类型定义
 *
 * 定义统一的本地化数据管理所需类型
 */

// ============================================
// 工作空间元数据
// ============================================

/**
 * 工作空间元数据
 */
export interface WorkspaceMetadata {
  /** 工作空间名称 */
  name: string;
  /** 创建时间 */
  createdAt: Date;
  /** 最后访问时间 */
  lastAccessedAt: Date;
  /** 工作空间版本 */
  version: string;
}

// ============================================
// 工作空间配置
// ============================================

/**
 * 会话配置
 */
export interface SessionConfig {
  /** 自动保存 */
  autoSave?: boolean;
  /** 自动压缩 */
  autoCompress?: boolean;
  /** 压缩阈值（消息数） */
  compressionThreshold?: number;
}

/**
 * 存储配置
 */
export interface StorageConfig {
  /** 最大会话数 */
  maxSessions?: number;
  /** 会话过期时间（毫秒） */
  sessionTTL?: number;
}

/**
 * 用户偏好配置
 */
export interface Preferences {
  /** 默认提供商 */
  defaultProvider?: string;
  /** 默认模型 */
  defaultModel?: string;
  /** 语言 */
  language?: string;
  /** 其他自定义配置 */
  [key: string]: unknown;
}

/**
 * 工作空间配置
 */
export interface WorkspaceConfig {
  /** 会话配置 */
  session?: SessionConfig;
  /** 存储配置 */
  storage?: StorageConfig;
  /** 用户偏好 */
  preferences?: Preferences;
}

// ============================================
// 工作空间路径
// ============================================

/**
 * 工作空间路径
 */
export interface WorkspacePaths {
  /** 根目录 */
  root: string;
  /** 配置文件 */
  configFile: string;
  /** 元数据文件 */
  metadataFile: string;
  /** 提供商配置文件 */
  providersFile: string;
  /** 缓存目录 */
  cacheDir: string;
  /** models.dev 缓存文件 */
  modelsDevCacheFile: string;
  /** models.dev SQLite 数据库文件 */
  modelsDevDbFile: string;
  /** SQLite 数据库文件 */
  dbFile: string;
}

// ============================================
// 初始化配置
// ============================================

/**
 * 工作空间初始化配置
 */
export interface WorkspaceInitConfig {
  /** 工作空间路径（默认: ./agent-workspace） */
  path?: string;
  /** 工作空间名称 */
  name?: string;
  /** 会话配置 */
  session?: SessionConfig;
  /** 存储配置 */
  storage?: StorageConfig;
  /** 用户偏好 */
  preferences?: Preferences;
  /** 是否自动创建（默认: true） */
  autoCreate?: boolean;
}

// ============================================
// 默认值
// ============================================

/**
 * 默认工作空间目录名
 */
export const DEFAULT_WORKSPACE_DIR = '.hive';

/**
 * 工作空间版本
 */
export const WORKSPACE_VERSION = '1.0.0';

/**
 * 默认工作空间名称
 */
export const DEFAULT_WORKSPACE_NAME = 'Default Workspace';
