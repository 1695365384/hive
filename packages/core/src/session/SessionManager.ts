/**
 * 会话管理器
 *
 * 管理会话生命周期、消息操作和持久化
 * 支持工作空间集成
 */

import { randomUUID } from 'crypto';
import type {
  Session,
  SessionConfig,
  SessionMetadata,
  Message,
  CompressionState,
  SessionStorageConfig,
} from './types.js';
import type { CreateMessageOptions } from './types.js';
import { SessionStorage } from './SessionStorage.js';
import {
  CompressionService,
  createCompressionService,
  type CompressionServiceConfig,
} from '../compression/index.js';
import type { WorkspaceManager } from '../workspace/index.js';

/**
 * 会话管理器配置
 */
export interface SessionManagerConfig {
  /** 存储配置 */
  storage?: Partial<SessionStorageConfig>;
  /** 自动保存 */
  autoSave?: boolean;
  /** 压缩服务配置 */
  compression?: CompressionServiceConfig;
  /** 是否启用自动压缩 */
  enableCompression?: boolean;
  /** 工作空间管理器（可选） */
  workspaceManager?: WorkspaceManager;
}

/**
 * 会话管理器
 */
export class SessionManager {
  private readonly storage: SessionStorage;
  private readonly autoSave: boolean;
  private readonly enableCompression: boolean;
  private readonly compressionService: CompressionService;
  private readonly workspaceManager?: WorkspaceManager;

  private currentSession: Session | null = null;
  private initialized: boolean = false;

  constructor(config?: SessionManagerConfig) {
    // 如果提供了工作空间管理器，使用工作空间的会话路径
    if (config?.workspaceManager) {
      this.workspaceManager = config.workspaceManager;
      // 使用 sessions 根目录，SessionStorage 会自动添加组名
      const sessionsRoot = config.workspaceManager.getPaths().sessionsDir;
      this.storage = new SessionStorage({
        ...config?.storage,
        storageDir: sessionsRoot,
      });
    } else {
      this.storage = new SessionStorage(config?.storage);
    }

    this.autoSave = config?.autoSave ?? true;
    this.enableCompression = config?.enableCompression ?? true;
    this.compressionService = createCompressionService(config?.compression);
  }

  /**
   * 初始化管理器
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.storage.initialize();
    this.initialized = true;
  }

  /**
   * 生成消息 ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${randomUUID().slice(0, 8)}`;
  }

  /**
   * 创建新会话
   */
  async createSession(config?: SessionConfig): Promise<Session> {
    await this.initialize();

    const now = new Date();
    const session: Session = {
      id: config?.id ?? randomUUID(),
      createdAt: now,
      updatedAt: now,
      messages: [],
      metadata: {
        totalTokens: 0,
        messageCount: 0,
        compressionCount: 0,
        title: config?.title,
        providerId: config?.providerId,
        model: config?.model,
      },
    };

    this.currentSession = session;

    if (this.autoSave) {
      await this.storage.save(session);
    }

    return session;
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  /**
   * 获取当前会话 ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSession?.id ?? null;
  }

  /**
   * 加载会话
   */
  async loadSession(sessionId: string): Promise<Session | null> {
    await this.initialize();

    const session = await this.storage.load(sessionId);
    if (session) {
      this.currentSession = session;
    }
    return session;
  }

  /**
   * 恢复最近的会话
   */
  async resumeLastSession(): Promise<Session | null> {
    await this.initialize();

    const session = await this.storage.getMostRecent();
    if (session) {
      this.currentSession = session;
    }
    return session;
  }

  /**
   * 添加消息
   */
  async addMessage(options: CreateMessageOptions): Promise<Message> {
    if (!this.currentSession) {
      await this.createSession();
    }

    const message: Message = {
      id: this.generateMessageId(),
      role: options.role,
      content: options.content,
      timestamp: new Date(),
      tokenCount: options.tokenCount,
    };

    this.currentSession!.messages.push(message);
    this.currentSession!.updatedAt = new Date();
    this.currentSession!.metadata.messageCount = this.currentSession!.messages.length;

    if (message.tokenCount) {
      this.currentSession!.metadata.totalTokens += message.tokenCount;
    }

    if (this.autoSave) {
      await this.storage.save(this.currentSession!);
    }

    return message;
  }

  /**
   * 添加用户消息
   */
  async addUserMessage(content: string, tokenCount?: number): Promise<Message> {
    return this.addMessage({ role: 'user', content, tokenCount });
  }

  /**
   * 添加助手消息
   */
  async addAssistantMessage(content: string, tokenCount?: number): Promise<Message> {
    return this.addMessage({ role: 'assistant', content, tokenCount });
  }

  /**
   * 添加系统消息
   */
  async addSystemMessage(content: string, tokenCount?: number): Promise<Message> {
    return this.addMessage({ role: 'system', content, tokenCount });
  }

  /**
   * 获取所有消息
   */
  getMessages(): Message[] {
    return this.currentSession?.messages ?? [];
  }

  /**
   * 获取消息数量
   */
  getMessageCount(): number {
    return this.currentSession?.messages.length ?? 0;
  }

  /**
   * 更新压缩状态
   */
  async updateCompressionState(state: CompressionState): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    this.currentSession.compressionState = state;
    this.currentSession.metadata.lastCompressedAt = state.lastCompressedAt;
    this.currentSession.metadata.compressionCount++;

    if (this.autoSave) {
      await this.storage.save(this.currentSession);
    }
  }

  /**
   * 替换消息（用于压缩后）
   */
  async replaceMessages(messages: Message[], tokensSaved: number): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    const oldCount = this.currentSession.messages.length;
    this.currentSession.messages = messages;
    this.currentSession.metadata.messageCount = messages.length;
    this.currentSession.metadata.totalTokens -= tokensSaved;
    this.currentSession.updatedAt = new Date();

    if (this.currentSession.compressionState) {
      this.currentSession.compressionState.originalMessageCount = oldCount;
      this.currentSession.compressionState.compressedMessageCount = messages.length;
      this.currentSession.compressionState.tokensSaved = tokensSaved;
    }

    if (this.autoSave) {
      await this.storage.save(this.currentSession);
    }
  }

  /**
   * 更新元数据
   */
  async updateMetadata(updates: Partial<SessionMetadata>): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    Object.assign(this.currentSession.metadata, updates);
    this.currentSession.updatedAt = new Date();

    if (this.autoSave) {
      await this.storage.save(this.currentSession);
    }
  }

  /**
   * 保存当前会话
   */
  async save(): Promise<void> {
    if (this.currentSession) {
      await this.storage.save(this.currentSession);
    }
  }

  /**
   * 删除当前会话
   */
  async deleteCurrentSession(): Promise<boolean> {
    if (!this.currentSession) {
      return false;
    }

    const deleted = await this.storage.delete(this.currentSession.id);
    if (deleted) {
      this.currentSession = null;
    }
    return deleted;
  }

  /**
   * 列出所有会话
   */
  async listSessions() {
    return this.storage.list();
  }

  /**
   * 清理过期会话
   */
  async cleanup() {
    return this.storage.cleanup();
  }

  /**
   * 检查是否需要压缩
   */
  needsCompression(): boolean {
    if (!this.currentSession || !this.enableCompression) {
      return false;
    }

    return this.compressionService.needsCompression(this.currentSession.messages);
  }

  /**
   * 执行压缩
   */
  async compress(): Promise<CompressionState | null> {
    if (!this.currentSession || !this.enableCompression) {
      return null;
    }

    const messages = this.currentSession.messages;
    if (!this.compressionService.needsCompression(messages)) {
      return null;
    }

    const result = await this.compressionService.compress(messages);

    // 更新会话
    await this.replaceMessages(result.messages, result.tokensSaved);
    await this.updateCompressionState(result.state);

    return result.state;
  }

  /**
   * 条件压缩（仅在需要时压缩）
   */
  async compressIfNeeded(): Promise<CompressionState | null> {
    if (!this.needsCompression()) {
      return null;
    }
    return this.compress();
  }

  /**
   * 获取压缩服务
   */
  getCompressionService(): CompressionService {
    return this.compressionService;
  }

  /**
   * 获取存储实例
   */
  getStorage(): SessionStorage {
    return this.storage;
  }

  /**
   * 设置当前会话组
   */
  async setSessionGroup(group: string): Promise<void> {
    if (this.workspaceManager) {
      await this.workspaceManager.setCurrentGroup(group);
      this.storage.setGroup(group);
      // 使用 sessions 根目录，SessionStorage 会自动添加组名
      this.storage.setStorageDir(this.workspaceManager.getPaths().sessionsDir);
    } else {
      this.storage.setGroup(group);
    }
  }

  /**
   * 获取当前会话组
   */
  getCurrentSessionGroup(): string {
    return this.storage.getGroup();
  }

  /**
   * 获取工作空间管理器
   */
  getWorkspaceManager(): WorkspaceManager | undefined {
    return this.workspaceManager;
  }
}

/**
 * 创建会话管理器实例
 */
export function createSessionManager(config?: SessionManagerConfig): SessionManager {
  return new SessionManager(config);
}
