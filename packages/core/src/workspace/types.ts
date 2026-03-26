/**
 * 工作空间类型定义
 *
 * 定义统一的本地化数据管理所需类型
 */

// ============================================
// 会话组
// ============================================

/**
 * 会话组
 */
export interface SessionGroup {
  /** 组名称 */
  name: string;
  /** 组描述 */
  description?: string;
  /** 创建时间 */
  createdAt: Date;
}

/**
 * 默认会话组
 */
export const DEFAULT_SESSION_GROUPS: SessionGroup[] = [
  { name: 'default', description: '默认会话', createdAt: new Date() },
  { name: 'archive', description: '归档会话', createdAt: new Date() },
];

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
  /** 会话组列表 */
  sessionGroups: SessionGroup[];
  /** 默认会话组 */
  defaultSessionGroup: string;
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
  /** 会话目录 */
  sessionsDir: string;
  /** 记忆目录 */
  memoryDir: string;
  /** 日志目录 */
  logsDir: string;
  /** 缓存目录 */
  cacheDir: string;
  /** models.dev 缓存文件 */
  modelsDevCacheFile: string;
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
export const DEFAULT_WORKSPACE_DIR = '.agent-workspace';

/**
 * 工作空间版本
 */
export const WORKSPACE_VERSION = '1.0.0';

/**
 * 默认工作空间名称
 */
export const DEFAULT_WORKSPACE_NAME = 'Default Workspace';

// ============================================
// 缓存类型
// ============================================

/**
 * 提供商模型信息（简化版，用于缓存）
 */
export interface CachedModelInfo {
  /** 模型 ID */
  id: string;
  /** 模型名称 */
  name: string;
  /** 上下文窗口 */
  contextWindow: number;
  /** 最大输出 token */
  maxOutputTokens?: number;
  /** 是否支持视觉 */
  supportsVision?: boolean;
  /** 是否支持工具 */
  supportsTools?: boolean;
}

/**
 * 提供商信息（简化版，用于缓存）
 */
export interface CachedProviderInfo {
  /** 提供商 ID */
  id: string;
  /** 显示名称 */
  name: string;
  /** API 基础 URL */
  baseUrl: string;
  /** 提供商类型 */
  type: string;
  /** 环境变量 Key 列表 */
  envKeys: string[];
  /** npm 包名 */
  npmPackage: string;
  /** 模型列表 */
  models: CachedModelInfo[];
}

/**
 * Models.dev 缓存数据结构
 */
export interface ModelsDevCache {
  /** 缓存版本 */
  version: string;
  /** 获取时间 ISO 字符串 */
  fetchedAt: string;
  /** 过期时间 ISO 字符串 */
  expiresAt: string;
  /** 提供商数据 */
  providers: CachedProviderInfo[];
}

/**
 * 缓存版本号（结构变更时递增）
 */
export const MODELS_DEV_CACHE_VERSION = '1.0.0';
