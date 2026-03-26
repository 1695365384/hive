/**
 * 会话存储实现
 *
 * 使用 SQLite 作为持久化后端
 */

import type {
  Session,
  SessionStorageConfig,
  SessionListItem,
} from './types.js';
import {
  DEFAULT_STORAGE_DIR,
  DEFAULT_MAX_SESSIONS,
  DEFAULT_SESSION_TTL,
} from './types.js';
import type { ISessionRepository } from '../storage/SessionRepository.js';

/**
 * 会话存储实现
 */
export class SessionStorage {
  private storageDir: string;
  private readonly maxSessions: number;
  private readonly sessionTTL: number;
  private currentGroup: string = 'default';
  private repository: ISessionRepository;

  constructor(config?: Partial<SessionStorageConfig> & { repository: ISessionRepository }) {
    this.storageDir = config?.storageDir ?? DEFAULT_STORAGE_DIR;
    this.maxSessions = config?.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.sessionTTL = config?.sessionTTL ?? DEFAULT_SESSION_TTL;

    if (!config?.repository) {
      throw new Error('SessionStorage requires a SessionRepository instance');
    }
    this.repository = config.repository;
  }

  /**
   * 获取当前会话组
   */
  getGroup(): string {
    return this.currentGroup;
  }

  /**
   * 保存会话
   */
  async save(session: Session): Promise<void> {
    await this.repository.save(session);
  }

  /**
   * 加载会话
   */
  async load(sessionId: string): Promise<Session | null> {
    return this.repository.load(sessionId);
  }

  /**
   * 删除会话
   */
  async delete(sessionId: string): Promise<boolean> {
    return this.repository.delete(sessionId);
  }

  /**
   * 检查会话是否存在
   */
  exists(sessionId: string): boolean {
    return this.repository.exists(sessionId);
  }

  /**
   * 列出所有会话（当前组）
   */
  async list(): Promise<SessionListItem[]> {
    return this.repository.list(this.currentGroup);
  }

  /**
   * 清理过期会话（当前组）
   * TODO: 实现基于 TTL 的清理
   */
  async cleanup(): Promise<number> {
    // SQLite mode: cleanup by TTL query
    // 需要在 Repository 中实现 cleanup 方法
    return 0;
  }

  /**
   * 获取最近的会话
   */
  async getMostRecent(): Promise<Session | null> {
    return this.repository.getMostRecent();
  }

  /**
   * 获取存储目录路径
   */
  getStorageDir(): string {
    return this.storageDir;
  }
}

/**
 * 创建会话存储实例
 */
export function createSessionStorage(
  config: Partial<SessionStorageConfig> & { repository: ISessionRepository }
): SessionStorage {
  return new SessionStorage(config);
}
