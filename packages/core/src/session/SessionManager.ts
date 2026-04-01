/**
 * 会话管理器
 *
 * 管理会话生命周期、消息操作和持久化
 * 使用 SQLite 作为存储后端
 */

import { randomUUID } from 'crypto';
import type {
  Session,
  SessionConfig,
  SessionMetadata,
  Message,
  CompressionState,
} from './types.js';
import type { CreateMessageOptions } from './types.js';
import type { ISessionRepository } from '../storage/SessionRepository.js';
import type { DispatchTraceEvent } from '../agents/capabilities/SessionCapability.js';
import {
  CompressionService,
  createCompressionService,
  type CompressionServiceConfig,
} from '../compression/index.js';

/**
 * Trace 存储键
 */
const TRACE_KEY = 'dispatch_traces';

/**
 * 会话管理器配置
 */
export interface SessionManagerConfig {
  /** Session Repository (必需) */
  repository: ISessionRepository;
  /** 自动保存 */
  autoSave?: boolean;
  /** 压缩服务配置 */
  compression?: CompressionServiceConfig;
  /** 是否启用自动压缩 */
  enableCompression?: boolean;
}

/**
 * 会话管理器
 */
export class SessionManager {
  private readonly repository: ISessionRepository;
  private readonly autoSave: boolean;
  private readonly enableCompression: boolean;
  private readonly compressionService: CompressionService;

  private currentSession: Session | null = null;

  constructor(config: SessionManagerConfig) {
    this.repository = config.repository;
    this.autoSave = config.autoSave ?? true;
    this.enableCompression = config.enableCompression ?? true;
    this.compressionService = createCompressionService(config.compression);
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
      await this.repository.save(session);
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
    const session = await this.repository.load(sessionId);
    if (session) {
      this.currentSession = session;
    }
    return session;
  }

  /**
   * 恢复最近的会话
   */
  async resumeLastSession(): Promise<Session | null> {
    const session = await this.repository.getMostRecent();
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

    const session = this.currentSession!;

    const message: Message = {
      id: this.generateMessageId(),
      role: options.role,
      content: options.content,
      timestamp: new Date(),
      tokenCount: options.tokenCount,
    };

    this.currentSession = {
      ...session,
      messages: [...session.messages, message],
      updatedAt: new Date(),
      metadata: {
        ...session.metadata,
        messageCount: session.messages.length + 1,
        totalTokens: session.metadata.totalTokens + (message.tokenCount ?? 0),
      },
    };

    if (this.autoSave) {
      await this.repository.save(this.currentSession);
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

    const session = this.currentSession;
    this.currentSession = {
      ...session,
      compressionState: state,
      metadata: {
        ...session.metadata,
        lastCompressedAt: state.lastCompressedAt,
        compressionCount: session.metadata.compressionCount + 1,
      },
    };

    if (this.autoSave) {
      await this.repository.save(this.currentSession);
    }
  }

  /**
   * 替换消息（用于压缩后）
   */
  async replaceMessages(messages: Message[], tokensSaved: number): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    const session = this.currentSession;
    const oldCount = session.messages.length;
    const updatedCompressionState = session.compressionState
      ? {
          ...session.compressionState,
          originalMessageCount: oldCount,
          compressedMessageCount: messages.length,
          tokensSaved,
        }
      : undefined;

    this.currentSession = {
      ...session,
      messages,
      updatedAt: new Date(),
      metadata: {
        ...session.metadata,
        messageCount: messages.length,
        totalTokens: session.metadata.totalTokens - tokensSaved,
      },
      compressionState: updatedCompressionState,
    };

    if (this.autoSave) {
      await this.repository.save(this.currentSession);
    }
  }

  /**
   * 更新元数据
   */
  async updateMetadata(updates: Partial<SessionMetadata>): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    this.currentSession = {
      ...this.currentSession,
      metadata: { ...this.currentSession.metadata, ...updates },
      updatedAt: new Date(),
    };

    if (this.autoSave) {
      await this.repository.save(this.currentSession);
    }
  }

  /**
   * 保存当前会话
   */
  async save(): Promise<void> {
    if (this.currentSession) {
      await this.repository.save(this.currentSession);
    }
  }

  /**
   * 删除当前会话
   */
  async deleteCurrentSession(): Promise<boolean> {
    if (!this.currentSession) {
      return false;
    }

    const deleted = await this.repository.delete(this.currentSession.id);
    if (deleted) {
      this.currentSession = null;
    }
    return deleted;
  }

  /**
   * 列出所有会话
   */
  async listSessions() {
    return this.repository.list();
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
   * 获取 Repository 实例
   */
  getRepository(): ISessionRepository {
    return this.repository;
  }

  // ============================================
  // Trace 持久化
  // ============================================

  /**
   * 保存 dispatch trace 事件
   *
   * 将 trace 事件数组存储到当前会话的元数据中。
   */
  async saveTrace(trace: DispatchTraceEvent[]): Promise<void> {
    if (!this.currentSession || trace.length === 0) {
      return;
    }

    const existingTraces = this.getTraces();
    existingTraces.push(trace);

    await this.updateMetadata({
      dispatchTraces: JSON.stringify(existingTraces),
    } as Partial<SessionMetadata>);
  }

  /**
   * 获取当前会话的所有 dispatch trace
   */
  getTraces(): DispatchTraceEvent[][] {
    if (!this.currentSession) {
      return [];
    }

    const raw = this.currentSession.metadata?.dispatchTraces;
    if (!raw || typeof raw !== 'string') {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as DispatchTraceEvent[][];
      }
    } catch {
      // corrupted data, ignore
    }

    return [];
  }
}

/**
 * 创建会话管理器实例
 */
export function createSessionManager(config: SessionManagerConfig): SessionManager {
  return new SessionManager(config);
}
