/**
 * 会话存储实现
 *
 * 基于 JSON 文件的会话持久化存储
 * 支持会话分组（通过 WorkspaceManager）
 */

import * as fs from 'fs';
import * as path from 'path';
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

/**
 * 会话存储实现
 */
export class SessionStorage {
  private storageDir: string;
  private readonly maxSessions: number;
  private readonly sessionTTL: number;
  private currentGroup: string = 'default';

  constructor(config?: Partial<SessionStorageConfig>) {
    this.storageDir = config?.storageDir ?? DEFAULT_STORAGE_DIR;
    this.maxSessions = config?.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.sessionTTL = config?.sessionTTL ?? DEFAULT_SESSION_TTL;
  }

  /**
   * 设置存储目录（用于工作空间切换）
   */
  setStorageDir(dir: string): void {
    this.storageDir = dir;
  }

  /**
   * 设置当前会话组
   */
  setGroup(group: string): void {
    this.currentGroup = group;
  }

  /**
   * 获取当前会话组
   */
  getGroup(): string {
    return this.currentGroup;
  }

  /**
   * 获取当前组的存储目录
   */
  private getGroupStorageDir(): string {
    return path.join(this.storageDir, this.currentGroup);
  }

  /**
   * 初始化存储目录
   */
  async initialize(): Promise<void> {
    const groupDir = this.getGroupStorageDir();
    if (!fs.existsSync(groupDir)) {
      await fs.promises.mkdir(groupDir, { recursive: true });
    }
  }

  /**
   * 获取会话文件路径
   */
  private getSessionPath(sessionId: string): string {
    return path.join(this.getGroupStorageDir(), `${sessionId}.json`);
  }

  /**
   * 保存会话
   */
  async save(session: Session): Promise<void> {
    await this.initialize();

    const filePath = this.getSessionPath(session.id);
    const content = JSON.stringify(session, null, 2);
    await fs.promises.writeFile(filePath, content, 'utf-8');
  }

  /**
   * 加载会话
   */
  async load(sessionId: string): Promise<Session | null> {
    const filePath = this.getSessionPath(sessionId);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const session = JSON.parse(content) as Session;

      // 转换日期字符串为 Date 对象
      session.createdAt = new Date(session.createdAt);
      session.updatedAt = new Date(session.updatedAt);
      session.messages = session.messages.map((msg) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));

      if (session.compressionState) {
        session.compressionState.lastCompressedAt = new Date(
          session.compressionState.lastCompressedAt
        );
      }

      if (session.metadata.lastCompressedAt) {
        session.metadata.lastCompressedAt = new Date(
          session.metadata.lastCompressedAt
        );
      }

      return session;
    } catch (error) {
      console.error(`[SessionStorage] Failed to load session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * 删除会话
   */
  async delete(sessionId: string): Promise<boolean> {
    const filePath = this.getSessionPath(sessionId);

    if (!fs.existsSync(filePath)) {
      return false;
    }

    await fs.promises.unlink(filePath);
    return true;
  }

  /**
   * 检查会话是否存在
   */
  exists(sessionId: string): boolean {
    const filePath = this.getSessionPath(sessionId);
    return fs.existsSync(filePath);
  }

  /**
   * 列出所有会话（当前组）
   */
  async list(): Promise<SessionListItem[]> {
    await this.initialize();

    const groupDir = this.getGroupStorageDir();
    if (!fs.existsSync(groupDir)) {
      return [];
    }

    const files = await fs.promises.readdir(groupDir);
    const sessions: SessionListItem[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const filePath = path.join(groupDir, file);
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const session = JSON.parse(content) as Session;

        sessions.push({
          id: session.id,
          title: session.metadata.title,
          createdAt: new Date(session.createdAt),
          updatedAt: new Date(session.updatedAt),
          messageCount: session.metadata.messageCount,
          totalTokens: session.metadata.totalTokens,
        });
      } catch {
        // 跳过无效的会话文件
        continue;
      }
    }

    // 按更新时间降序排序
    sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return sessions;
  }

  /**
   * 清理过期会话（当前组）
   */
  async cleanup(): Promise<number> {
    await this.initialize();

    const groupDir = this.getGroupStorageDir();
    if (!fs.existsSync(groupDir)) {
      return 0;
    }

    const now = Date.now();
    const files = await fs.promises.readdir(groupDir);
    let deletedCount = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const filePath = path.join(groupDir, file);
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const session = JSON.parse(content) as Session;
        const updatedAt = new Date(session.updatedAt).getTime();

        if (now - updatedAt > this.sessionTTL) {
          await fs.promises.unlink(filePath);
          deletedCount++;
        }
      } catch {
        // 跳过无效文件
        continue;
      }
    }

    return deletedCount;
  }

  /**
   * 获取最近的会话
   */
  async getMostRecent(): Promise<Session | null> {
    const sessions = await this.list();

    if (sessions.length === 0) {
      return null;
    }

    return this.load(sessions[0].id);
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
  config?: Partial<SessionStorageConfig>
): SessionStorage {
  return new SessionStorage(config);
}
