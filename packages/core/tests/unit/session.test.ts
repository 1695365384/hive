/**
 * 会话管理测试
 *
 * 使用 MockSessionRepository 测试 SessionManager 和 SessionStorage
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager, createSessionManager } from '../../src/session/SessionManager.js';
import { SessionStorage } from '../../src/session/SessionStorage.js';
import { MockSessionRepository, MockMemoryRepository } from '../helpers/mock-repository.js';

describe('SessionStorage', () => {
  let storage: SessionStorage;
  let repository: MockSessionRepository;

  beforeEach(async () => {
    repository = new MockSessionRepository();
    storage = new SessionStorage({ repository });
  });

  it('should save and load session', async () => {
    const session = {
      id: 'test-session-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [
        { id: 'msg-1', role: 'user' as const, content: 'Hello', timestamp: new Date(), tokenCount: 5 },
      ],
      metadata: {
        totalTokens: 5,
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

describe('SessionManager', () => {
  let manager: SessionManager;
  let repository: MockSessionRepository;

  beforeEach(async () => {
    repository = new MockSessionRepository();
    manager = createSessionManager({
      repository,
      autoSave: true,
      enableCompression: true,
    });
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

    // 创建新的管理器实例（使用相同的 repository）
    const manager2 = createSessionManager({ repository });

    // 加载会话
    const loaded = await manager2.loadSession(session1.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.messages.length).toBe(2);
    expect(loaded?.metadata.title).toBe('Persistent Session');
  });

  it('should resume last session', async () => {
    // 创建第一个会话
    await manager.createSession({ title: 'Session 1' });
    await manager.addUserMessage('Message in session 1');
    await manager.save();

    // 等待确保时间戳不同
    await new Promise(resolve => setTimeout(resolve, 10));

    // 创建第二个会话（更晚）
    await manager.createSession({ title: 'Session 2' });
    await manager.addUserMessage('Message in session 2');
    await manager.save();

    // 创建新管理器并恢复最近会话
    const manager2 = createSessionManager({ repository });

    const resumed = await manager2.resumeLastSession();
    expect(resumed).not.toBeNull();
    expect(resumed?.metadata.title).toBe('Session 2');
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

  describe('Compression Edge Cases', () => {
    it('should handle compression with existing compressionState', async () => {
      await manager.createSession();

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
      const noCompressRepository = new MockSessionRepository();
      const noCompressManager = createSessionManager({
        repository: noCompressRepository,
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
});
