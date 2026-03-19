/**
 * 会话能力模块
 *
 * 提供会话管理和持久化功能
 * 支持工作空间集成
 */

import type { AgentCapability, AgentContext } from '../core/types.js';
import type {
  Session,
  SessionConfig,
  Message,
  CreateMessageOptions,
  CompressionState,
} from '../../session/types.js';
import { SessionManager, type SessionManagerConfig } from '../../session/SessionManager.js';
import type { WorkspaceManager, WorkspaceInitConfig } from '../../workspace/index.js';
import { initWorkspace, DEFAULT_WORKSPACE_DIR } from '../../workspace/index.js';

/**
 * 会话能力配置
 */
export interface SessionCapabilityConfig {
  /** 会话管理器配置 */
  sessionManager?: SessionManagerConfig;
  /** 是否在会话开始时自动恢复上次会话 */
  autoResume?: boolean;
  /** 工作空间配置 */
  workspace?: WorkspaceInitConfig;
  /** 工作空间路径（简写） */
  workspacePath?: string;
}

/**
 * 会话能力实现
 */
export class SessionCapability implements AgentCapability {
  readonly name = 'session';
  private context!: AgentContext;
  private config: SessionCapabilityConfig;
  private sessionManager: SessionManager;
  private workspaceManager?: WorkspaceManager;
  private autoResume: boolean;
  private initialized: boolean = false;

  constructor(config?: SessionCapabilityConfig) {
    this.config = config ?? {};
    this.autoResume = config?.autoResume ?? false;

    // 如果提供了工作空间配置，延迟初始化
    if (config?.workspace || config?.workspacePath) {
      // 先创建一个临时的 SessionManager，稍后会在 initializeAsync 中重新创建
      this.sessionManager = new SessionManager({
        ...config?.sessionManager,
        storage: {
          ...config?.sessionManager?.storage,
          storageDir: config?.workspacePath
            ? `${config.workspacePath}/sessions`
            : `./${DEFAULT_WORKSPACE_DIR}/sessions`,
        },
      });
    } else {
      this.sessionManager = new SessionManager(config?.sessionManager);
    }
  }

  initialize(context: AgentContext): void {
    this.context = context;
  }

  /**
   * 异步初始化（加载会话和工作空间）
   */
  async initializeAsync(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 如果有工作空间配置，初始化工作空间
    const workspaceConfig = this.config.workspace;
    const workspacePath = this.config.workspacePath;

    if (workspaceConfig || workspacePath) {
      const config = workspaceConfig ?? { path: workspacePath };
      this.workspaceManager = await initWorkspace(config);

      // 重新配置 SessionManager 使用工作空间路径
      this.sessionManager = new SessionManager({
        workspaceManager: this.workspaceManager,
        autoSave: this.config.sessionManager?.autoSave ?? true,
        enableCompression: this.config.sessionManager?.enableCompression ?? true,
        compression: this.config.sessionManager?.compression,
      });
    }

    await this.sessionManager.initialize();

    if (this.autoResume) {
      await this.sessionManager.resumeLastSession();
    }

    this.initialized = true;
  }

  /**
   * 获取工作空间管理器
   */
  getWorkspaceManager(): WorkspaceManager | undefined {
    return this.workspaceManager;
  }

  /**
   * 设置当前会话组
   */
  async setSessionGroup(group: string): Promise<void> {
    await this.initializeAsync();
    await this.sessionManager.setSessionGroup(group);
  }

  /**
   * 获取当前会话组
   */
  getCurrentSessionGroup(): string {
    return this.sessionManager.getCurrentSessionGroup();
  }

  /**
   * 列出所有会话组
   */
  listSessionGroups() {
    return this.workspaceManager?.getSessionGroups() ?? [];
  }

  /**
   * 获取会话管理器
   */
  getManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * 创建新会话
   */
  async createSession(config?: SessionConfig): Promise<Session> {
    await this.initializeAsync();
    return this.sessionManager.createSession(config);
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): Session | null {
    return this.sessionManager.getCurrentSession();
  }

  /**
   * 获取当前会话 ID
   */
  getCurrentSessionId(): string | null {
    return this.sessionManager.getCurrentSessionId();
  }

  /**
   * 加载会话
   */
  async loadSession(sessionId: string): Promise<Session | null> {
    await this.initializeAsync();
    return this.sessionManager.loadSession(sessionId);
  }

  /**
   * 恢复最近的会话
   */
  async resumeLastSession(): Promise<Session | null> {
    await this.initializeAsync();
    return this.sessionManager.resumeLastSession();
  }

  /**
   * 添加消息
   */
  async addMessage(options: CreateMessageOptions): Promise<Message> {
    await this.initializeAsync();
    return this.sessionManager.addMessage(options);
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
    return this.sessionManager.getMessages();
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
    await this.sessionManager.save();
  }

  /**
   * 删除当前会话
   */
  async deleteCurrentSession(): Promise<boolean> {
    return this.sessionManager.deleteCurrentSession();
  }

  /**
   * 列出所有会话
   */
  async listSessions() {
    await this.initializeAsync();
    return this.sessionManager.listSessions();
  }

  /**
   * 清理过期会话
   */
  async cleanup() {
    await this.initializeAsync();
    return this.sessionManager.cleanup();
  }

  /**
   * 检查是否需要压缩
   */
  needsCompression(): boolean {
    return this.sessionManager.needsCompression();
  }

  /**
   * 执行压缩
   */
  async compress(): Promise<CompressionState | null> {
    await this.initializeAsync();
    return this.sessionManager.compress();
  }

  /**
   * 条件压缩（仅在需要时压缩）
   */
  async compressIfNeeded(): Promise<CompressionState | null> {
    await this.initializeAsync();
    return this.sessionManager.compressIfNeeded();
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
  }
}

/**
 * 创建会话能力实例
 */
export function createSessionCapability(config?: SessionCapabilityConfig): SessionCapability {
  return new SessionCapability(config);
}
