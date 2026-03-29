/**
 * 会话能力模块
 *
 * 提供会话管理和持久化功能
 * 使用 SQLite 作为存储后端
 */

import type { AgentCapability, AgentContext } from '../core/types.js';
import type {
  Session,
  SessionConfig,
  Message,
  CreateMessageOptions,
  CompressionState,
} from '../../session/types.js';
import type { DispatchTraceEvent } from '../dispatch/types.js';
import { SessionManager } from '../../session/SessionManager.js';
import { DatabaseManager, createDatabase } from '../../storage/Database.js';
import { SessionRepository, createSessionRepository } from '../../storage/SessionRepository.js';
import type { WorkspaceManager } from '../../workspace/index.js';

/**
 * 会话能力配置
 */
export interface SessionCapabilityConfig {
  /** 数据库路径（可选，默认使用工作空间路径） */
  dbPath?: string;
  /** 是否在会话开始时自动恢复上次会话 */
  autoResume?: boolean;
  /** 自动保存 */
  autoSave?: boolean;
  /** 是否启用压缩 */
  enableCompression?: boolean;
  /** 工作空间管理器（可选） */
  workspaceManager?: WorkspaceManager;
}

/**
 * 会话能力实现
 */
export class SessionCapability implements AgentCapability {
  readonly name = 'session';
  private context!: AgentContext;
  private config: SessionCapabilityConfig;
  private sessionManager: SessionManager | null = null;
  private dbManager: DatabaseManager | null = null;
  private autoResume: boolean;
  private initialized: boolean = false;

  constructor(config?: SessionCapabilityConfig) {
    this.config = config ?? {};
    this.autoResume = config?.autoResume ?? false;
  }

  initialize(context: AgentContext): void {
    this.context = context;
  }

  /**
   * 异步初始化（通过 AgentCapability 接口调用）
   *
   * 加载数据库和会话，在所有能力的 initialize() 完成后由
   * AgentContextImpl.initializeAll() 自动调用。
   */
  async initializeAsync(_context: AgentContext): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 确定数据库路径
    const dbPath = this.config.dbPath
      ?? this.config.workspaceManager?.getPaths().dbFile
      ?? './.hive/hive.db';

    // 创建数据库管理器
    this.dbManager = createDatabase({ dbPath });
    await this.dbManager.initialize();

    // 创建 SessionRepository
    const repository = createSessionRepository(this.dbManager.getDb());

    // 创建 SessionManager
    this.sessionManager = new SessionManager({
      repository,
      autoSave: this.config.autoSave ?? true,
      enableCompression: this.config.enableCompression ?? true,
    });

    // 自动恢复上次会话
    if (this.autoResume) {
      await this.sessionManager.resumeLastSession();
    }

    this.initialized = true;
  }

  /**
   * 确保已初始化（内部便捷方法）
   * @returns The initialized SessionManager
   * @throws Error if not initialized
   */
  private async requireSessionManager(): Promise<SessionManager> {
    if (!this.initialized && this.context) {
      await this.initializeAsync(this.context);
    }
    if (!this.sessionManager) {
      throw new Error('SessionCapability not initialized.');
    }
    return this.sessionManager;
  }

  /**
   * 确保已初始化（同步检查）
   * @returns The initialized SessionManager
   * @throws Error if not initialized
   */
  private requireSessionManagerSync(): SessionManager {
    if (!this.sessionManager) {
      throw new Error('SessionCapability not initialized.');
    }
    return this.sessionManager;
  }

  /**
   * 获取会话管理器
   */
  getManager(): SessionManager {
    return this.requireSessionManagerSync();
  }

  /**
   * 获取工作空间管理器（如果已配置）
   */
  getWorkspaceManager(): WorkspaceManager | undefined {
    return this.config.workspaceManager;
  }

  /**
   * 创建新会话
   */
  async createSession(config?: SessionConfig): Promise<Session> {
    const sm = await this.requireSessionManager();
    return sm.createSession(config);
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): Session | null {
    return this.sessionManager?.getCurrentSession() ?? null;
  }

  /**
   * 获取当前会话 ID
   */
  getCurrentSessionId(): string | null {
    return this.sessionManager?.getCurrentSessionId() ?? null;
  }

  /**
   * 加载会话
   */
  async loadSession(sessionId: string): Promise<Session | null> {
    const sm = await this.requireSessionManager();
    return sm.loadSession(sessionId);
  }

  /**
   * 恢复最近的会话
   */
  async resumeLastSession(): Promise<Session | null> {
    const sm = await this.requireSessionManager();
    return sm.resumeLastSession();
  }

  /**
   * 添加消息
   */
  async addMessage(options: CreateMessageOptions): Promise<Message> {
    const sm = await this.requireSessionManager();
    return sm.addMessage(options);
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
   * 获取所有消息
   */
  getMessages(): Message[] {
    return this.sessionManager?.getMessages() ?? [];
  }

  /**
   * 获取消息历史（格式化为提示）
   */
  getFormattedHistory(): string {
    const messages = this.getMessages();
    if (messages.length === 0) {
      return '';
    }

    const lines: string[] = ['[历史对话]'];

    for (const msg of messages) {
      const roleLabel = {
        user: '用户',
        assistant: '助手',
        system: '系统',
      }[msg.role];

      lines.push(`${roleLabel}: ${msg.content}`);
    }

    return lines.join('\n');
  }

  /**
   * 保存当前会话
   */
  async save(): Promise<void> {
    await this.sessionManager?.save();
  }

  /**
   * 删除当前会话
   */
  async deleteCurrentSession(): Promise<boolean> {
    return this.sessionManager?.deleteCurrentSession() ?? false;
  }

  /**
   * 列出所有会话
   */
  async listSessions() {
    const sm = await this.requireSessionManager();
    return sm.listSessions();
  }

  /**
   * 检查是否需要压缩
   */
  needsCompression(): boolean {
    return this.sessionManager?.needsCompression() ?? false;
  }

  /**
   * 执行压缩
   */
  async compress(): Promise<CompressionState | null> {
    const sm = await this.requireSessionManager();
    return sm.compress();
  }

  /**
   * 条件压缩（仅在需要时压缩）
   */
  async compressIfNeeded(): Promise<CompressionState | null> {
    const sm = await this.requireSessionManager();
    return sm.compressIfNeeded();
  }

  /**
   * 保存 dispatch trace 事件
   */
  async saveTrace(trace: DispatchTraceEvent[]): Promise<void> {
    const sm = await this.requireSessionManager();
    return sm.saveTrace(trace);
  }

  /**
   * 销毁
   */
  async dispose(): Promise<void> {
    if (this.sessionManager) {
      // 退出前检查并执行压缩
      await this.sessionManager.compressIfNeeded();
      await this.sessionManager.save();
    }
    // 关闭数据库连接
    this.dbManager?.close();
  }
}

/**
 * 创建会话能力实例
 */
export function createSessionCapability(config?: SessionCapabilityConfig): SessionCapability {
  return new SessionCapability(config);
}
