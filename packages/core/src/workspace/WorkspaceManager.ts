/**
 * 工作空间管理器
 *
 * 统一管理所有本地化数据：会话、配置、记忆等
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { safeJsonParse } from '../utils/safe-json-parse.js';
import {
  DEFAULT_WORKSPACE_DIR,
  DEFAULT_WORKSPACE_NAME,
  WORKSPACE_VERSION,
  DEFAULT_SESSION_GROUPS,
} from './index.js';
import type {
  WorkspaceMetadata,
  WorkspaceConfig,
  WorkspacePaths,
  WorkspaceInitConfig,
  SessionGroup,
  Preferences,
  SessionConfig,
  StorageConfig,
} from './types.js';

/**
 * 工作空间管理器
 *
 * 负责创建、加载和管理工作空间目录结构
 */
export class WorkspaceManager {
  private rootPath: string;
  private metadata: WorkspaceMetadata | null = null;
  private config: WorkspaceConfig;
  private currentGroup: string = 'default';
  private initialized: boolean = false;

  constructor(config?: WorkspaceInitConfig) {
    this.rootPath = config?.path ?? path.join(process.cwd(), DEFAULT_WORKSPACE_DIR);
    this.config = {
      session: config?.session,
      storage: config?.storage,
      preferences: config?.preferences,
    };
  }

  /**
   * 初始化工作空间（自动创建目录结构）
   */
  async initialize(rootPath?: string): Promise<void> {
    if (rootPath) {
      this.rootPath = rootPath;
    }

    const paths = this.getPaths();

    // 检查是否已存在工作空间
    if (fs.existsSync(paths.metadataFile)) {
      await this.load(this.rootPath);
      return;
    }

    // 创建目录结构
    await this.createDirectoryStructure();

    // 创建元数据
    this.metadata = {
      name: DEFAULT_WORKSPACE_NAME,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      version: WORKSPACE_VERSION,
      sessionGroups: [...DEFAULT_SESSION_GROUPS],
      defaultSessionGroup: 'default',
    };

    // 保存元数据
    await this.saveMetadata();

    // 保存默认配置
    await this.saveConfig();

    this.currentGroup = 'default';
    this.initialized = true;
  }

  /**
   * 加载已存在的工作空间
   */
  async load(rootPath: string): Promise<void> {
    this.rootPath = rootPath;
    const paths = this.getPaths();

    if (!fs.existsSync(paths.metadataFile)) {
      throw new Error(`Workspace not found at ${rootPath}`);
    }

    // 加载元数据
    const metadataContent = await fs.promises.readFile(paths.metadataFile, 'utf-8');
    const parsedMetadata = safeJsonParse<Partial<WorkspaceMetadata>>(metadataContent, {});

    // 转换日期
    this.metadata = {
      name: parsedMetadata.name ?? DEFAULT_WORKSPACE_NAME,
      version: parsedMetadata.version ?? WORKSPACE_VERSION,
      defaultSessionGroup: parsedMetadata.defaultSessionGroup ?? 'default',
      sessionGroups: (parsedMetadata.sessionGroups ?? DEFAULT_SESSION_GROUPS).map((g: SessionGroup) => ({
        ...g,
        createdAt: new Date(g.createdAt),
      })),
      createdAt: new Date(parsedMetadata.createdAt ?? Date.now()),
      lastAccessedAt: new Date(parsedMetadata.lastAccessedAt ?? Date.now()),
    };

    // 加载配置
    if (fs.existsSync(paths.configFile)) {
      const configContent = await fs.promises.readFile(paths.configFile, 'utf-8');
      this.config = safeJsonParse<WorkspaceConfig>(configContent, this.config);
    }

    // 更新最后访问时间
    if (this.metadata) {
      this.metadata.lastAccessedAt = new Date();
      await this.saveMetadata();
      this.currentGroup = this.metadata.defaultSessionGroup;
    }
    this.initialized = true;
  }

  /**
   * 创建目录结构
   */
  private async createDirectoryStructure(): Promise<void> {
    const paths = this.getPaths();
    const dirs = [
      paths.root,
      paths.sessionsDir,
      path.join(paths.sessionsDir, 'default'),
      path.join(paths.sessionsDir, 'archive'),
      paths.memoryDir,
      paths.logsDir,
      paths.cacheDir,
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }
    }
  }

  /**
   * 保存元数据
   */
  private async saveMetadata(): Promise<void> {
    if (!this.metadata) return;

    const paths = this.getPaths();
    const content = JSON.stringify(this.metadata, null, 2);
    await fs.promises.writeFile(paths.metadataFile, content, 'utf-8');
  }

  /**
   * 保存配置
   */
  private async saveConfig(): Promise<void> {
    const paths = this.getPaths();
    const content = JSON.stringify(this.config, null, 2);
    await fs.promises.writeFile(paths.configFile, content, 'utf-8');
  }

  /**
   * 获取工作空间路径
   */
  getPaths(): WorkspacePaths {
    return {
      root: this.rootPath,
      configFile: path.join(this.rootPath, 'config.json'),
      metadataFile: path.join(this.rootPath, 'workspace.json'),
      providersFile: path.join(this.rootPath, 'providers.json'),
      sessionsDir: path.join(this.rootPath, 'sessions'),
      memoryDir: path.join(this.rootPath, 'memory'),
      logsDir: path.join(this.rootPath, 'logs'),
      cacheDir: path.join(this.rootPath, 'cache'),
      modelsDevCacheFile: path.join(this.rootPath, 'cache', 'models-dev.json'),
      modelsDevDbFile: path.join(this.rootPath, 'models-dev.db'),
      dbFile: path.join(this.rootPath, 'hive.db'),
    };
  }

  /**
   * 获取元数据
   */
  getMetadata(): WorkspaceMetadata | null {
    return this.metadata;
  }

  /**
   * 获取配置
   */
  getConfig(): WorkspaceConfig {
    return this.config;
  }

  /**
   * 更新配置
   */
  async updateConfig(updates: Partial<WorkspaceConfig>): Promise<void> {
    this.config = {
      session: { ...this.config.session, ...updates.session },
      storage: { ...this.config.storage, ...updates.storage },
      preferences: { ...this.config.preferences, ...updates.preferences },
    };
    await this.saveConfig();
  }

  /**
   * 更新偏好设置
   */
  async updatePreferences(updates: Preferences): Promise<void> {
    this.config.preferences = { ...this.config.preferences, ...updates };
    await this.saveConfig();
  }

  // ============================================
  // 会话组管理
  // ============================================

  /**
   * 获取当前会话组
   */
  getCurrentGroup(): string {
    return this.currentGroup;
  }

  /**
   * 设置当前会话组
   */
  async setCurrentGroup(name: string): Promise<void> {
    if (!this.metadata) {
      throw new Error('Workspace not initialized');
    }

    const group = this.metadata.sessionGroups.find(g => g.name === name);
    if (!group) {
      throw new Error(`Session group "${name}" not found`);
    }

    this.currentGroup = name;
  }

  /**
   * 获取所有会话组
   */
  getSessionGroups(): SessionGroup[] {
    return this.metadata?.sessionGroups ?? [];
  }

  /**
   * 创建会话组
   */
  async createSessionGroup(name: string, description?: string): Promise<SessionGroup> {
    if (!this.metadata) {
      throw new Error('Workspace not initialized');
    }

    // 检查是否已存在
    if (this.metadata.sessionGroups.some(g => g.name === name)) {
      throw new Error(`Session group "${name}" already exists`);
    }

    const group: SessionGroup = {
      name,
      description,
      createdAt: new Date(),
    };

    this.metadata.sessionGroups.push(group);

    // 创建目录
    const groupPath = path.join(this.getPaths().sessionsDir, name);
    if (!fs.existsSync(groupPath)) {
      await fs.promises.mkdir(groupPath, { recursive: true });
    }

    await this.saveMetadata();
    return group;
  }

  /**
   * 删除会话组
   */
  async deleteSessionGroup(name: string): Promise<boolean> {
    if (!this.metadata) {
      throw new Error('Workspace not initialized');
    }

    // 不能删除默认组
    if (name === 'default' || name === 'archive') {
      throw new Error('Cannot delete default session groups');
    }

    const index = this.metadata.sessionGroups.findIndex(g => g.name === name);
    if (index === -1) {
      return false;
    }

    // 删除组目录
    const groupPath = path.join(this.getPaths().sessionsDir, name);
    if (fs.existsSync(groupPath)) {
      await fs.promises.rm(groupPath, { recursive: true });
    }

    this.metadata.sessionGroups.splice(index, 1);

    // 如果当前组被删除，切换到默认组
    if (this.currentGroup === name) {
      this.currentGroup = 'default';
    }

    await this.saveMetadata();
    return true;
  }

  /**
   * 重命名会话组
   */
  async renameSessionGroup(oldName: string, newName: string): Promise<boolean> {
    if (!this.metadata) {
      throw new Error('Workspace not initialized');
    }

    // 不能重命名默认组
    if (oldName === 'default' || oldName === 'archive') {
      throw new Error('Cannot rename default session groups');
    }

    const group = this.metadata.sessionGroups.find(g => g.name === oldName);
    if (!group) {
      return false;
    }

    // 检查新名称是否已存在
    if (this.metadata.sessionGroups.some(g => g.name === newName)) {
      throw new Error(`Session group "${newName}" already exists`);
    }

    // 重命名目录
    const oldPath = path.join(this.getPaths().sessionsDir, oldName);
    const newPath = path.join(this.getPaths().sessionsDir, newName);
    if (fs.existsSync(oldPath)) {
      await fs.promises.rename(oldPath, newPath);
    }

    group.name = newName;

    // 更新当前组
    if (this.currentGroup === oldName) {
      this.currentGroup = newName;
    }

    await this.saveMetadata();
    return true;
  }

  // ============================================
  // 路径获取
  // ============================================

  /**
   * 获取会话存储路径（按组）
   */
  getSessionsPath(group?: string): string {
    const groupName = group ?? this.currentGroup;
    return path.join(this.getPaths().sessionsDir, groupName);
  }

  /**
   * 获取记忆文件路径
   */
  getMemoryPath(): string {
    return path.join(this.getPaths().memoryDir, 'facts.json');
  }

  /**
   * 获取日志文件路径
   */
  getLogPath(): string {
    return path.join(this.getPaths().logsDir, 'agent.log');
  }

  /**
   * 获取提供商配置路径
   */
  getProvidersPath(): string {
    return this.getPaths().providersFile;
  }

  // ============================================
  // 配置获取
  // ============================================

  /**
   * 获取会话配置
   */
  getSessionConfig(): SessionConfig {
    return this.config.session ?? {};
  }

  /**
   * 获取存储配置
   */
  getStorageConfig(): StorageConfig {
    return this.config.storage ?? {};
  }

  /**
   * 获取偏好设置
   */
  getPreferences(): Preferences {
    return this.config.preferences ?? {};
  }

  // ============================================
  // 工作空间状态
  // ============================================

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取工作空间根路径
   */
  getRootPath(): string {
    return this.rootPath;
  }

  /**
   * 检查工作空间是否存在
   */
  exists(): boolean {
    return fs.existsSync(path.join(this.rootPath, 'workspace.json'));
  }
}

/**
 * 初始化工作空间
 */
export async function initWorkspace(config?: WorkspaceInitConfig): Promise<WorkspaceManager> {
  const manager = new WorkspaceManager(config);

  // 确定工作空间路径
  const rootPath = config?.path
    || process.env.AGENT_WORKSPACE
    || path.join(process.cwd(), DEFAULT_WORKSPACE_DIR);

  // 如果存在则加载，否则创建
  const metadataPath = path.join(rootPath, 'workspace.json');
  if (fs.existsSync(metadataPath)) {
    await manager.load(rootPath);
  } else if (config?.autoCreate !== false) {
    await manager.initialize(rootPath);
  } else {
    throw new Error(`Workspace not found at ${rootPath}`);
  }

  return manager;
}

/**
 * 创建工作空间管理器实例
 */
export function createWorkspaceManager(config?: WorkspaceInitConfig): WorkspaceManager {
  return new WorkspaceManager(config);
}
