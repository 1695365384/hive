/**
 * 会话数据结构定义
 *
 * 定义会话持久化和智能压缩所需的类型
 */

// ============================================
// 消息类型
// ============================================

/**
 * 消息角色
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * 会话消息
 */
export interface Message {
  /** 消息 ID */
  id: string;
  /** 角色 */
  role: MessageRole;
  /** 内容 */
  content: string;
  /** 时间戳 */
  timestamp: Date;
  /** Token 数量（可选，延迟计算） */
  tokenCount?: number;
}

/**
 * 创建消息的选项
 */
export interface CreateMessageOptions {
  role: MessageRole;
  content: string;
  tokenCount?: number;
}

// ============================================
// 压缩状态
// ============================================

/**
 * 压缩状态
 */
export interface CompressionState {
  /** 最后压缩时间 */
  lastCompressedAt: Date;
  /** 原始消息数 */
  originalMessageCount: number;
  /** 压缩后消息数 */
  compressedMessageCount: number;
  /** 使用的策略 */
  strategy: string;
  /** 节省的 Token 数 */
  tokensSaved: number;
}

// ============================================
// 会话元数据
// ============================================

/**
 * 会话元数据
 */
export interface SessionMetadata {
  /** 总 Token 数 */
  totalTokens: number;
  /** 消息数 */
  messageCount: number;
  /** 最后压缩时间 */
  lastCompressedAt?: Date;
  /** 压缩次数 */
  compressionCount: number;
  /** 会话标题（可选，用于显示） */
  title?: string;
  /** 关联的提供商 ID */
  providerId?: string;
  /** 关联的模型 */
  model?: string;
}

// ============================================
// 会话
// ============================================

/**
 * 会话配置
 */
export interface SessionConfig {
  /** 会话 ID（可选，自动生成） */
  id?: string;
  /** 初始标题 */
  title?: string;
  /** 关联的提供商 ID */
  providerId?: string;
  /** 关联的模型 */
  model?: string;
}

/**
 * 会话
 */
export interface Session {
  /** 会话 ID */
  id: string;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
  /** 消息列表 */
  messages: Message[];
  /** 元数据 */
  metadata: SessionMetadata;
  /** 压缩状态（可选） */
  compressionState?: CompressionState;
}

// ============================================
// 存储配置
// ============================================

/**
 * 会话存储配置
 */
export interface SessionStorageConfig {
  /** 存储目录 */
  storageDir: string;
  /** 最大会话数（用于清理） */
  maxSessions?: number;
  /** 会话过期时间（毫秒） */
  sessionTTL?: number;
}

/**
 * 会话列表项
 */
export interface SessionListItem {
  /** 会话 ID */
  id: string;
  /** 标题 */
  title?: string;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
  /** 消息数 */
  messageCount: number;
  /** 总 Token 数 */
  totalTokens: number;
}

// ============================================
// 默认值
// ============================================

/**
 * 默认会话存储目录
 */
export const DEFAULT_STORAGE_DIR = './.sessions';

/**
 * 默认最大会话数
 */
export const DEFAULT_MAX_SESSIONS = 100;

/**
 * 默认会话过期时间（7 天）
 */
export const DEFAULT_SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
