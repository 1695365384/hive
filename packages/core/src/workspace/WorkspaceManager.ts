/**
 * 工作空间管理器
 *
 * 统一管理所有本地化数据：会话、配置等
 */

import * as fs from 'fs';
import * as path from 'path';
import { safeJsonParse } from '../utils/safe-json-parse.js';
import {
  DEFAULT_WORKSPACE_DIR,
  DEFAULT_WORKSPACE_NAME,
  WORKSPACE_VERSION,
} from './index.js';
import type {
  WorkspaceMetadata,
  WorkspaceConfig,
  WorkspacePaths,
  WorkspaceInitConfig,
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
    };

    // 保存元数据
    await this.saveMetadata();

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
