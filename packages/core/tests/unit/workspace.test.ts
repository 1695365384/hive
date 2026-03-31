/**
 * 工作空间单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  WorkspaceManager,
  initWorkspace,
  createWorkspaceManager,
  DEFAULT_WORKSPACE_DIR,
  WORKSPACE_VERSION,
  DEFAULT_SESSION_GROUPS,
} from '../../src/workspace/index.js';

// 测试用临时目录
const TEST_WORKSPACE_DIR = path.join(process.cwd(), '.test-workspace');

describe('WorkspaceManager', () => {
  let manager: WorkspaceManager;

  beforeEach(() => {
    // 确保测试目录不存在
    if (fs.existsSync(TEST_WORKSPACE_DIR)) {
      fs.rmSync(TEST_WORKSPACE_DIR, { recursive: true });
    }
    manager = createWorkspaceManager({ path: TEST_WORKSPACE_DIR });
  });

  afterEach(() => {
    // 清理测试目录
    if (fs.existsSync(TEST_WORKSPACE_DIR)) {
      fs.rmSync(TEST_WORKSPACE_DIR, { recursive: true });
    }
  });

  describe('initialize', () => {
    it('应该创建工作空间目录结构', async () => {
      await manager.initialize();

      const paths = manager.getPaths();

      expect(fs.existsSync(paths.root)).toBe(true);
      expect(fs.existsSync(paths.cacheDir)).toBe(true);
      expect(fs.existsSync(paths.metadataFile)).toBe(true);
    });

    it('应该创建正确的元数据', async () => {
      await manager.initialize();

      const metadata = manager.getMetadata();
      expect(metadata).not.toBeNull();
      expect(metadata!.version).toBe(WORKSPACE_VERSION);
      expect(metadata!.sessionGroups).toHaveLength(2);
      expect(metadata!.defaultSessionGroup).toBe('default');
    });

    it('如果工作空间已存在，应该加载而不是重新创建', async () => {
      // 第一次初始化
      await manager.initialize();
      const firstMetadata = manager.getMetadata();

      // 等待一小段时间确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));

      // 第二次初始化
      const manager2 = createWorkspaceManager({ path: TEST_WORKSPACE_DIR });
      await manager2.initialize();
      const secondMetadata = manager2.getMetadata();

      // 创建时间应该相同
      expect(secondMetadata!.createdAt).toEqual(firstMetadata!.createdAt);
      // 最后访问时间应该更新
      expect(secondMetadata!.lastAccessedAt.getTime()).toBeGreaterThanOrEqual(
        firstMetadata!.lastAccessedAt.getTime()
      );
    });

    it('应该接受 rootPath 参数覆盖构造函数路径', async () => {
      // 使用构造函数指定一个路径
      const defaultManager = createWorkspaceManager({ path: TEST_WORKSPACE_DIR });

      // 但在 initialize 时使用另一个路径
      const alternativePath = TEST_WORKSPACE_DIR + '-alternative';
      await defaultManager.initialize(alternativePath);

      // 根路径应该是 alternativePath
      expect(defaultManager.getRootPath()).toBe(alternativePath);
      expect(fs.existsSync(alternativePath)).toBe(true);

      // 清理
      if (fs.existsSync(alternativePath)) {
        fs.rmSync(alternativePath, { recursive: true });
      }
    });
  });

  describe('load', () => {
    it('应该正确加载已存在的工作空间', async () => {
      // 先创建
      await manager.initialize();
      const originalMetadata = manager.getMetadata();

      // 创建新的管理器并加载
      const manager2 = createWorkspaceManager({ path: TEST_WORKSPACE_DIR });
      await manager2.load(TEST_WORKSPACE_DIR);

      const loadedMetadata = manager2.getMetadata();
      expect(loadedMetadata!.name).toBe(originalMetadata!.name);
      expect(loadedMetadata!.version).toBe(originalMetadata!.version);
    });

    it('如果工作空间不存在，应该抛出错误', async () => {
      const manager2 = createWorkspaceManager({ path: '/non/existent/path' });
      await expect(manager2.load('/non/existent/path')).rejects.toThrow('Workspace not found');
    });
  });

  describe('getPaths', () => {
    it('应该返回正确的路径', async () => {
      await manager.initialize();

      const paths = manager.getPaths();

      expect(paths.root).toBe(TEST_WORKSPACE_DIR);
      expect(paths.configFile).toBe(path.join(TEST_WORKSPACE_DIR, 'config.json'));
      expect(paths.metadataFile).toBe(path.join(TEST_WORKSPACE_DIR, 'workspace.json'));
      expect(paths.providersFile).toBe(path.join(TEST_WORKSPACE_DIR, 'providers.json'));
      expect(paths.sessionsDir).toBe(path.join(TEST_WORKSPACE_DIR, 'sessions'));
      expect(paths.memoryDir).toBe(path.join(TEST_WORKSPACE_DIR, 'memory'));
      expect(paths.logsDir).toBe(path.join(TEST_WORKSPACE_DIR, 'logs'));
    });
  });

  // @deprecated Session groups are no longer used — sessions are stored in SQLite
  describe.skip('Session Groups', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('应该返回默认会话组', () => {
      const groups = manager.getSessionGroups();
      expect(groups).toHaveLength(2);
      expect(groups.map(g => g.name)).toContain('default');
      expect(groups.map(g => g.name)).toContain('archive');
    });

    it('应该创建新的会话组', async () => {
      const group = await manager.createSessionGroup('custom', '自定义组');

      expect(group.name).toBe('custom');
      expect(group.description).toBe('自定义组');

      const groups = manager.getSessionGroups();
      expect(groups).toHaveLength(3);
      expect(groups.map(g => g.name)).toContain('custom');
    });

    it('不应该创建重复的会话组', async () => {
      await expect(manager.createSessionGroup('default')).rejects.toThrow('already exists');
    });

    it('应该删除会话组', async () => {
      await manager.createSessionGroup('to-delete');

      const deleted = await manager.deleteSessionGroup('to-delete');
      expect(deleted).toBe(true);

      const groups = manager.getSessionGroups();
      expect(groups.map(g => g.name)).not.toContain('to-delete');
    });

    it('不应该删除默认会话组', async () => {
      await expect(manager.deleteSessionGroup('default')).rejects.toThrow('Cannot delete default');
      await expect(manager.deleteSessionGroup('archive')).rejects.toThrow('Cannot delete default');
    });

    it('删除不存在的组应该返回 false', async () => {
      const deleted = await manager.deleteSessionGroup('non-existent');
      expect(deleted).toBe(false);
    });

    it('应该切换当前会话组', async () => {
      await manager.createSessionGroup('test-group');
      await manager.setCurrentGroup('test-group');

      expect(manager.getCurrentGroup()).toBe('test-group');
      expect(manager.getSessionsPath()).toBe(path.join(TEST_WORKSPACE_DIR, 'sessions', 'test-group'));
    });

    it('切换到不存在的组应该抛出错误', async () => {
      await expect(manager.setCurrentGroup('non-existent')).rejects.toThrow('not found');
    });

    it('应该重命名会话组', async () => {
      await manager.createSessionGroup('old-name');
      const renamed = await manager.renameSessionGroup('old-name', 'new-name');

      expect(renamed).toBe(true);

      const groups = manager.getSessionGroups();
      expect(groups.map(g => g.name)).toContain('new-name');
      expect(groups.map(g => g.name)).not.toContain('old-name');
    });

    it('不应该重命名默认会话组', async () => {
      await expect(manager.renameSessionGroup('default', 'new-default')).rejects.toThrow('Cannot rename default');
      await expect(manager.renameSessionGroup('archive', 'new-archive')).rejects.toThrow('Cannot rename default');
    });

    it('重命名不存在的组应该返回 false', async () => {
      const renamed = await manager.renameSessionGroup('non-existent', 'new-name');
      expect(renamed).toBe(false);
    });

    it('重命名到已存在的名称应该抛出错误', async () => {
      await manager.createSessionGroup('group-a');
      await manager.createSessionGroup('group-b');

      await expect(manager.renameSessionGroup('group-a', 'group-b')).rejects.toThrow('already exists');
    });

    it('重命名后当前组应该更新', async () => {
      await manager.createSessionGroup('current-group');
      await manager.setCurrentGroup('current-group');
      expect(manager.getCurrentGroup()).toBe('current-group');

      await manager.renameSessionGroup('current-group', 'renamed-group');
      expect(manager.getCurrentGroup()).toBe('renamed-group');
    });

    it('删除当前组后应该切换到默认组', async () => {
      // 创建并设置为当前组
      await manager.createSessionGroup('current-to-delete');
      await manager.setCurrentGroup('current-to-delete');
      expect(manager.getCurrentGroup()).toBe('current-to-delete');

      // 删除当前组
      await manager.deleteSessionGroup('current-to-delete');

      // 应该自动切换到默认组
      expect(manager.getCurrentGroup()).toBe('default');
    });

    it('未初始化时删除会话组应该抛出错误', async () => {
      const uninitializedManager = createWorkspaceManager({ path: TEST_WORKSPACE_DIR + '-uninit' });

      await expect(uninitializedManager.deleteSessionGroup('some-group')).rejects.toThrow('Workspace not initialized');

      // 清理
      if (fs.existsSync(TEST_WORKSPACE_DIR + '-uninit')) {
        fs.rmSync(TEST_WORKSPACE_DIR + '-uninit', { recursive: true });
      }
    });

    it('未初始化时重命名会话组应该抛出错误', async () => {
      const uninitializedManager = createWorkspaceManager({ path: TEST_WORKSPACE_DIR + '-uninit-rename' });

      await expect(uninitializedManager.renameSessionGroup('old-name', 'new-name')).rejects.toThrow('Workspace not initialized');

      // 清理
      if (fs.existsSync(TEST_WORKSPACE_DIR + '-uninit-rename')) {
        fs.rmSync(TEST_WORKSPACE_DIR + '-uninit-rename', { recursive: true });
      }
    });
  });

  describe('Config', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('应该获取和更新配置', async () => {
      await manager.updateConfig({
        session: { autoSave: false, autoCompress: true },
      });

      const config = manager.getConfig();
      expect(config.session?.autoSave).toBe(false);
      expect(config.session?.autoCompress).toBe(true);
    });

    it('应该更新偏好设置', async () => {
      await manager.updatePreferences({
        defaultProvider: 'openai',
        language: 'zh-CN',
      });

      const prefs = manager.getPreferences();
      expect(prefs.defaultProvider).toBe('openai');
      expect(prefs.language).toBe('zh-CN');
    });
  });

  // @deprecated Sessions are stored in SQLite
  describe.skip('getSessionsPath', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('应该返回当前组的会话路径', () => {
      expect(manager.getSessionsPath()).toBe(path.join(TEST_WORKSPACE_DIR, 'sessions', 'default'));
    });

    it('应该返回指定组的会话路径', () => {
      expect(manager.getSessionsPath('archive')).toBe(path.join(TEST_WORKSPACE_DIR, 'sessions', 'archive'));
    });
  });

  describe('Path Methods', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    // @deprecated Memory feature not implemented
    it.skip('应该返回记忆文件路径', () => {
      expect(manager.getMemoryPath()).toBe(path.join(TEST_WORKSPACE_DIR, 'memory', 'facts.json'));
    });

    // @deprecated Logs managed by file-logger
    it.skip('应该返回日志文件路径', () => {
      expect(manager.getLogPath()).toBe(path.join(TEST_WORKSPACE_DIR, 'logs', 'agent.log'));
    });

    it('应该返回提供商配置路径', () => {
      expect(manager.getProvidersPath()).toBe(path.join(TEST_WORKSPACE_DIR, 'providers.json'));
    });

    it('应该返回工作空间根路径', () => {
      expect(manager.getRootPath()).toBe(TEST_WORKSPACE_DIR);
    });
  });

  describe('Config Methods', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('应该返回会话配置', async () => {
      await manager.updateConfig({
        session: { autoSave: false, autoCompress: true },
      });

      const sessionConfig = manager.getSessionConfig();
      expect(sessionConfig.autoSave).toBe(false);
      expect(sessionConfig.autoCompress).toBe(true);
    });

    it('应该返回存储配置', async () => {
      await manager.updateConfig({
        storage: { maxSessions: 50, sessionTTL: 3600000 },
      });

      const storageConfig = manager.getStorageConfig();
      expect(storageConfig.maxSessions).toBe(50);
      expect(storageConfig.sessionTTL).toBe(3600000);
    });

    it('应该返回偏好设置（空时）', () => {
      const prefs = manager.getPreferences();
      expect(prefs).toEqual({});
    });

    it('应该返回偏好设置（有值时）', async () => {
      await manager.updatePreferences({
        defaultProvider: 'openai',
        language: 'zh-CN',
      });

      const prefs = manager.getPreferences();
      expect(prefs.defaultProvider).toBe('openai');
      expect(prefs.language).toBe('zh-CN');
    });
  });

  describe('State Methods', () => {
    it('初始化前应该返回 false', () => {
      expect(manager.isInitialized()).toBe(false);
    });

    it('初始化后应该返回 true', async () => {
      await manager.initialize();
      expect(manager.isInitialized()).toBe(true);
    });

    it('应该检查工作空间是否存在', async () => {
      expect(manager.exists()).toBe(false);

      await manager.initialize();
      expect(manager.exists()).toBe(true);
    });
  });
});

describe('initWorkspace', () => {
  afterEach(() => {
    if (fs.existsSync(TEST_WORKSPACE_DIR)) {
      fs.rmSync(TEST_WORKSPACE_DIR, { recursive: true });
    }
  });

  it('应该创建并初始化工作空间', async () => {
    const manager = await initWorkspace({ path: TEST_WORKSPACE_DIR });

    expect(manager.isInitialized()).toBe(true);
    expect(manager.exists()).toBe(true);
  });

  it('应该加载已存在的工作空间', async () => {
    // 第一次创建
    const manager1 = await initWorkspace({ path: TEST_WORKSPACE_DIR });
    expect(manager1.isInitialized()).toBe(true);

    // 第二次加载
    const manager2 = await initWorkspace({ path: TEST_WORKSPACE_DIR });
    expect(manager2.isInitialized()).toBe(true);
    expect(manager2.getMetadata()).not.toBeNull();
  });

  it('autoCreate=false 时，如果不存在应该抛出错误', async () => {
    await expect(
      initWorkspace({ path: '/non/existent/path', autoCreate: false })
    ).rejects.toThrow('Workspace not found');
  });

  it('应该使用环境变量中的路径', async () => {
    const originalEnv = process.env.AGENT_WORKSPACE;
    process.env.AGENT_WORKSPACE = TEST_WORKSPACE_DIR;

    try {
      const manager = await initWorkspace({});
      expect(manager.getRootPath()).toBe(TEST_WORKSPACE_DIR);
    } finally {
      process.env.AGENT_WORKSPACE = originalEnv;
    }
  });
});

describe('Integration with SessionStorage', () => {
  it('工作空间应该提供数据库文件路径', async () => {
    const wsManager = await initWorkspace({ path: TEST_WORKSPACE_DIR });

    const paths = wsManager.getPaths();

    // 检查数据库文件路径已包含在工作空间路径中
    expect(paths.dbFile).toBeDefined();
    expect(paths.dbFile).toBe(path.join(TEST_WORKSPACE_DIR, 'hive.db'));

    // 清理
    fs.rmSync(TEST_WORKSPACE_DIR, { recursive: true });
  });

  it('会话应该存储在 SQLite 数据库中', async () => {
    const { createDatabase } = await import('../../src/storage/Database.js');
    const { createSessionRepository } = await import('../../src/storage/SessionRepository.js');

    const wsManager = await initWorkspace({ path: TEST_WORKSPACE_DIR });
    const dbPath = wsManager.getPaths().dbFile;

    // 创建数据库和仓库
    const dbManager = createDatabase({ dbPath });
    await dbManager.initialize(); // This runs migrations

    const repository = createSessionRepository(dbManager.getDb());

    // 创建测试会话
    const testSession = {
      id: 'test-session-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [],
      metadata: {
        totalTokens: 0,
        messageCount: 0,
        compressionCount: 0,
      },
    };

    await repository.save(testSession);

    // 验证会话可以加载
    const loaded = await repository.load('test-session-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe('test-session-1');

    // 检查数据库文件是否存在
    expect(fs.existsSync(dbPath)).toBe(true);

    // 清理
    dbManager.close();
    fs.rmSync(TEST_WORKSPACE_DIR, { recursive: true });
  });
});
