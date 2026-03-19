/**
 * 会话管理测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager, createSessionManager } from '../../src/session/SessionManager.js';
import { SessionStorage } from '../../src/session/SessionStorage.js';
import * as fs from 'fs';
import * as path from 'path';

// 测试用的临时目录
const TEST_DIR = './.test-sessions';

describe('SessionStorage', () => {
  let storage: SessionStorage;

  beforeEach(async () => {
    storage = new SessionStorage({ storageDir: TEST_DIR });
    await storage.initialize();
  });

  afterEach(async () => {
    // 清理测试目录
    if (fs.existsSync(TEST_DIR)) {
      await fs.promises.rm(TEST_DIR, { recursive: true });
    }
  });

  it('should initialize storage directory', () => {
    expect(fs.existsSync(TEST_DIR)).toBe(true);
  });

  it('should save and load session', async () => {
    const session = {
      id: 'test-session-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [
        { id: 'msg-1', role: 'user' as const, content: 'Hello', timestamp: new Date() },
      ],
      metadata: {
        totalTokens: 10,
        messageCount: 1,
        compressionCount: 0,
      },
    };

    await storage.save(session);
    const loaded = await storage.load('test-session-1');

    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe('test-session-1');
    expect(loaded?.messages.length).toBe(1);
    expect(loaded?.messages[0].content).toBe('Hello');
  });

  it('should return null for non-existent session', async () => {
    const loaded = await storage.load('non-existent');
    expect(loaded).toBeNull();
  });

  it('should list sessions', async () => {
    const session1 = {
      id: 'session-1',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
      messages: [],
      metadata: { totalTokens: 0, messageCount: 0, compressionCount: 0 },
    };
    const session2 = {
      id: 'session-2',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-03'),
      messages: [],
      metadata: { totalTokens: 0, messageCount: 0, compressionCount: 0 },
    };

    await storage.save(session1);
    await storage.save(session2);

    const list = await storage.list();
    expect(list.length).toBe(2);
    // 按更新时间降序
    expect(list[0].id).toBe('session-2');
    expect(list[1].id).toBe('session-1');
  });

  it('should delete session', async () => {
    const session = {
      id: 'to-delete',
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [],
      metadata: { totalTokens: 0, messageCount: 0, compressionCount: 0 },
    };

    await storage.save(session);
    expect(storage.exists('to-delete')).toBe(true);

    const deleted = await storage.delete('to-delete');
    expect(deleted).toBe(true);
    expect(storage.exists('to-delete')).toBe(false);
  });

  it('should return false when deleting non-existent session', async () => {
    const deleted = await storage.delete('non-existent');
    expect(deleted).toBe(false);
  });

  describe('Group Support', () => {
    it('should set and get current group', () => {
      expect(storage.getGroup()).toBe('default');
      storage.setGroup('custom');
      expect(storage.getGroup()).toBe('custom');
    });

    it('should change storage directory dynamically', () => {
      const newDir = './.test-sessions-new';
      storage.setStorageDir(newDir);
      expect(storage.getStorageDir()).toBe(newDir);
    });

    it('should get storage directory', () => {
      expect(storage.getStorageDir()).toBe(TEST_DIR);
    });
  });

  describe('Edge Cases', () => {
    it('should return null when getting most recent from empty storage', async () => {
      const recent = await storage.getMostRecent();
      expect(recent).toBeNull();
    });

    it('should get most recent session correctly', async () => {
      const session1 = {
        id: 'session-1',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        messages: [],
        metadata: { totalTokens: 0, messageCount: 0, compressionCount: 0 },
      };
      const session2 = {
        id: 'session-2',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-03'),
        messages: [],
        metadata: { totalTokens: 0, messageCount: 0, compressionCount: 0 },
      };

      await storage.save(session1);
      await storage.save(session2);

      const recent = await storage.getMostRecent();
      expect(recent).not.toBeNull();
      expect(recent?.id).toBe('session-2');
    });
  });

  describe('Error Handling', () => {
    it('should return null when loading session with invalid JSON', async () => {
      // 手动创建一个无效的 JSON 文件
      const groupDir = path.join(TEST_DIR, 'default');
      const invalidFile = path.join(groupDir, 'invalid-session.json');
      await fs.promises.writeFile(invalidFile, 'not valid json', 'utf-8');

      const loaded = await storage.load('invalid-session');
      expect(loaded).toBeNull();
    });

    it('should skip non-JSON files in cleanup', async () => {
      // 创建一些非 JSON 文件
      const groupDir = path.join(TEST_DIR, 'default');
      await fs.promises.writeFile(path.join(groupDir, 'readme.txt'), 'text file', 'utf-8');
      await fs.promises.writeFile(path.join(groupDir, 'data.csv'), 'csv,data', 'utf-8');

      // cleanup 应该跳过这些文件
      const deletedCount = await storage.cleanup();
      expect(deletedCount).toBe(0);

      // 非 JSON 文件应该仍然存在
      expect(fs.existsSync(path.join(groupDir, 'readme.txt'))).toBe(true);
      expect(fs.existsSync(path.join(groupDir, 'data.csv'))).toBe(true);
    });

    it('should skip invalid files in cleanup', async () => {
      // 创建一个无效的 JSON 文件
      const groupDir = path.join(TEST_DIR, 'default');
      await fs.promises.writeFile(path.join(groupDir, 'invalid.json'), 'not valid json', 'utf-8');

      // cleanup 应该跳过无效文件而不报错
      const deletedCount = await storage.cleanup();
      expect(deletedCount).toBe(0);
    });

    it('should return 0 when cleanup directory does not exist', async () => {
      // 创建一个指向不存在目录的 storage
      const nonExistentStorage = new SessionStorage({ storageDir: './.non-existent-dir-cleanup' });
      // 不初始化，直接调用 cleanup
      const deletedCount = await nonExistentStorage.cleanup();
      expect(deletedCount).toBe(0);
    });
  });
});

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(async () => {
    manager = createSessionManager({
      storage: { storageDir: TEST_DIR },
      autoSave: true,
      enableCompression: true,
    });
  });

  afterEach(async () => {
    if (fs.existsSync(TEST_DIR)) {
      await fs.promises.rm(TEST_DIR, { recursive: true });
    }
  });

  it('should create session', async () => {
    const session = await manager.createSession({ title: 'Test Session' });

    expect(session.id).toBeDefined();
    expect(session.metadata.title).toBe('Test Session');
    expect(session.messages.length).toBe(0);
  });

  it('should add messages', async () => {
    await manager.createSession();

    const msg1 = await manager.addUserMessage('Hello');
    const msg2 = await manager.addAssistantMessage('Hi there!');

    const messages = manager.getMessages();
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Hello');
    expect(messages[1].role).toBe('assistant');
  });

  it('should persist session across manager instances', async () => {
    // 第一个管理器创建会话并添加消息
    const session1 = await manager.createSession({ title: 'Persistent Session' });
    await manager.addUserMessage('Message 1');
    await manager.addAssistantMessage('Response 1');

    // 创建新的管理器实例
    const manager2 = createSessionManager({
      storage: { storageDir: TEST_DIR },
    });

    // 加载会话
    const loaded = await manager2.loadSession(session1.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.messages.length).toBe(2);
    expect(loaded?.metadata.title).toBe('Persistent Session');
  });

  it('should resume last session', async () => {
    // 使用独立的测试目录避免干扰
    const resumeTestDir = TEST_DIR + '-resume';
    const resumeManager = createSessionManager({
      storage: { storageDir: resumeTestDir },
    });

    // 创建第一个会话
    await resumeManager.createSession({ title: 'Session 1' });
    await resumeManager.addUserMessage('Message in session 1');
    await resumeManager.save();

    // 等待确保时间戳不同
    await new Promise(resolve => setTimeout(resolve, 10));

    // 创建第二个会话（更晚）
    await resumeManager.createSession({ title: 'Session 2' });
    await resumeManager.addUserMessage('Message in session 2');
    await resumeManager.save();

    // 创建新管理器并恢复最近会话
    const manager2 = createSessionManager({
      storage: { storageDir: resumeTestDir },
    });

    const resumed = await manager2.resumeLastSession();
    expect(resumed).not.toBeNull();
    expect(resumed?.metadata.title).toBe('Session 2');

    // 清理测试目录
    if (fs.existsSync(resumeTestDir)) {
      await fs.promises.rm(resumeTestDir, { recursive: true });
    }
  });

  it('should update metadata', async () => {
    await manager.createSession();

    await manager.updateMetadata({
      title: 'Updated Title',
      providerId: 'test-provider',
    });

    const session = manager.getCurrentSession();
    expect(session?.metadata.title).toBe('Updated Title');
    expect(session?.metadata.providerId).toBe('test-provider');
  });

  describe('Message Operations', () => {
    it('should add system message', async () => {
      await manager.createSession();

      const msg = await manager.addSystemMessage('System instruction');

      expect(msg.role).toBe('system');
      expect(msg.content).toBe('System instruction');
      expect(manager.getMessages().length).toBe(1);
    });

    it('should get message count', async () => {
      await manager.createSession();
      expect(manager.getMessageCount()).toBe(0);

      await manager.addUserMessage('Hello');
      await manager.addAssistantMessage('Hi!');
      expect(manager.getMessageCount()).toBe(2);
    });

    it('should handle messages with token count', async () => {
      await manager.createSession();

      await manager.addUserMessage('Hello', 10);
      await manager.addAssistantMessage('Hi!', 5);

      const session = manager.getCurrentSession();
      expect(session?.metadata.totalTokens).toBe(15);
    });
  });

  describe('Session Operations', () => {
    it('should delete current session', async () => {
      await manager.createSession({ title: 'To Delete' });
      const sessionId = manager.getCurrentSessionId();

      const deleted = await manager.deleteCurrentSession();
      expect(deleted).toBe(true);
      expect(manager.getCurrentSession()).toBeNull();
    });

    it('should return false when deleting with no current session', async () => {
      const deleted = await manager.deleteCurrentSession();
      expect(deleted).toBe(false);
    });

    it('should list all sessions', async () => {
      await manager.createSession({ title: 'Session 1' });
      await manager.save();
      await manager.createSession({ title: 'Session 2' });
      await manager.save();

      const sessions = await manager.listSessions();
      expect(sessions.length).toBe(2);
    });

    it('should cleanup expired sessions', async () => {
      // Create session with short TTL
      const shortTtlManager = createSessionManager({
        storage: {
          storageDir: TEST_DIR + '-cleanup',
          sessionTTL: 100, // 100ms
        },
      });

      await shortTtlManager.createSession();
      await shortTtlManager.addUserMessage('Test');
      await shortTtlManager.save();

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      const deletedCount = await shortTtlManager.cleanup();
      expect(deletedCount).toBe(1);

      // Cleanup test directory
      if (fs.existsSync(TEST_DIR + '-cleanup')) {
        await fs.promises.rm(TEST_DIR + '-cleanup', { recursive: true });
      }
    });
  });

  describe('Compression', () => {
    it('should check if compression is needed', async () => {
      await manager.createSession();

      // Empty session should not need compression
      expect(manager.needsCompression()).toBe(false);
    });

    it('should return false when no current session for compression check', async () => {
      expect(manager.needsCompression()).toBe(false);
    });

    it('should compress when needed', async () => {
      await manager.createSession();

      // Add many messages to trigger compression need
      for (let i = 0; i < 100; i++) {
        await manager.addUserMessage(`Message ${i}`);
      }

      // Check if compression is needed (depends on threshold)
      const needsCompress = manager.needsCompression();

      if (needsCompress) {
        const result = await manager.compress();
        expect(result).not.toBeNull();
        expect(result?.lastCompressedAt).toBeDefined();
      }
    });

    it('should return null when compression not needed', async () => {
      await manager.createSession();

      // Empty session should not need compression
      const result = await manager.compress();
      expect(result).toBeNull();
    });

    it('should compress if needed', async () => {
      await manager.createSession();

      // Add many messages to trigger compression
      for (let i = 0; i < 100; i++) {
        await manager.addUserMessage(`Message ${i}`);
      }

      const result = await manager.compressIfNeeded();
      // With 100 messages, compression should be triggered
      expect(result).not.toBeNull();
      expect(result?.tokensSaved).toBeGreaterThan(0);
    });

    it('should get compression service', () => {
      const service = manager.getCompressionService();
      expect(service).toBeDefined();
    });
  });

  describe('Storage Access', () => {
    it('should get storage instance', () => {
      const storage = manager.getStorage();
      expect(storage).toBeDefined();
      expect(storage.getStorageDir()).toBe(TEST_DIR);
    });
  });

  describe('Compression Edge Cases', () => {
    it('should handle compression with existing compressionState', async () => {
      await manager.createSession();

      // 先执行一次压缩设置 compressionState
      // 添加足够多的消息以触发压缩
      for (let i = 0; i < 100; i++) {
        await manager.addUserMessage(`Message ${i}`);
      }

      // 第一次压缩
      const firstResult = await manager.compress();
      expect(firstResult).not.toBeNull();

      // 再添加一些消息
      for (let i = 0; i < 50; i++) {
        await manager.addUserMessage(`Second batch ${i}`);
      }

      // 第二次压缩（此时已有 compressionState）
      const secondResult = await manager.compress();
      expect(secondResult).not.toBeNull();

      const session = manager.getCurrentSession();
      expect(session?.compressionState?.tokensSaved).toBeGreaterThan(0);
    });

    it('should return null when compressing with no session', async () => {
      // 不创建会话，直接尝试压缩
      const result = await manager.compress();
      expect(result).toBeNull();
    });

    it('should return null when compression is disabled', async () => {
      const noCompressManager = createSessionManager({
        storage: { storageDir: TEST_DIR + '-no-compress' },
        enableCompression: false,
      });

      await noCompressManager.createSession();

      // 添加消息
      for (let i = 0; i < 100; i++) {
        await noCompressManager.addUserMessage(`Message ${i}`);
      }

      // 禁用压缩时应返回 null
      const result = await noCompressManager.compress();
      expect(result).toBeNull();

      // 清理
      if (fs.existsSync(TEST_DIR + '-no-compress')) {
        await fs.promises.rm(TEST_DIR + '-no-compress', { recursive: true });
      }
    });

    it('should not compress when not needed', async () => {
      await manager.createSession();

      // 空会话不需要压缩
      const result = await manager.compressIfNeeded();
      expect(result).toBeNull();
    });
  });

  describe('Metadata Edge Cases', () => {
    it('should do nothing when updating metadata with no session', async () => {
      // 不创建会话，直接尝试更新元数据
      await manager.updateMetadata({ title: 'Test' });

      // 应该不会抛出错误，且没有当前会话
      expect(manager.getCurrentSession()).toBeNull();
    });

    it('should do nothing when updating compression state with no session', async () => {
      // 不创建会话，直接尝试更新压缩状态
      await manager.updateCompressionState({
        lastCompressedAt: new Date(),
        originalMessageCount: 10,
        compressedMessageCount: 5,
        tokensSaved: 100,
        strategy: 'sliding-window',
      });

      // 应该不会抛出错误，且没有当前会话
      expect(manager.getCurrentSession()).toBeNull();
    });

    it('should do nothing when replacing messages with no session', async () => {
      // 不创建会话，直接尝试替换消息
      await manager.replaceMessages([], 100);

      // 应该不会抛出错误，且没有当前会话
      expect(manager.getCurrentSession()).toBeNull();
    });
  });

  describe('Auto-create Session', () => {
    it('should auto-create session when adding message without existing session', async () => {
      // 不先创建会话，直接添加消息
      // 此时应该自动创建会话
      const msg = await manager.addUserMessage('Hello without session');

      // 检查会话是否被自动创建
      expect(manager.getCurrentSession()).not.toBeNull();
      expect(msg.content).toBe('Hello without session');
      expect(manager.getMessages().length).toBe(1);
    });
  });

  describe('Workspace Integration', () => {
    it('should set session group with workspace manager', async () => {
      // 创建带有工作空间管理器的 SessionManager
      const { WorkspaceManager } = await import('../../src/workspace/WorkspaceManager.js');
      const wsManager = new WorkspaceManager({ path: TEST_DIR + '-ws-integration' });
      await wsManager.initialize();
      await wsManager.createSessionGroup('custom-group');

      const wsManagerInstance = createSessionManager({
        storage: { storageDir: TEST_DIR + '-ws-integration-sessions' },
        workspaceManager: wsManager,
      });

      await wsManagerInstance.setSessionGroup('custom-group');
      expect(wsManagerInstance.getCurrentSessionGroup()).toBe('custom-group');
      expect(wsManagerInstance.getWorkspaceManager()).toBe(wsManager);

      // 清理
      if (fs.existsSync(TEST_DIR + '-ws-integration')) {
        await fs.promises.rm(TEST_DIR + '-ws-integration', { recursive: true });
      }
    });

    it('should set session group without workspace manager', async () => {
      await manager.createSession();
      manager.getStorage().setGroup('default');

      await manager.setSessionGroup('custom');
      expect(manager.getCurrentSessionGroup()).toBe('custom');
    });

    it('should return undefined when no workspace manager', () => {
      expect(manager.getWorkspaceManager()).toBeUndefined();
    });
  });
});
