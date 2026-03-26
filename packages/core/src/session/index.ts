/**
 * 会话模块导出
 */

// 类型
export type {
  Message,
  MessageRole,
  CreateMessageOptions,
  CompressionState,
  SessionMetadata,
  SessionConfig,
  Session,
  SessionStorageConfig,
  SessionListItem,
} from './types.js';

// 常量
export {
  DEFAULT_STORAGE_DIR,
  DEFAULT_MAX_SESSIONS,
  DEFAULT_SESSION_TTL,
} from './types.js';

// 存储
export { SessionStorage, createSessionStorage } from './SessionStorage.js';

// 管理器
export {
  SessionManager,
  createSessionManager,
  type SessionManagerConfig,
} from './SessionManager.js';
