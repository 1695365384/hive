/**
 * Session + Workspace 集成测试
 *
 * 测试 SessionManager 和 WorkspaceManager 之间的交互
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SessionManager, createSessionManager } from '../../src/session/SessionManager.js';
import {
  WorkspaceManager,
  initWorkspace,
  createWorkspaceManager,
} from '../../src/workspace/index.js';

// 测试用临时目录
const TEST_DIR = path.join(process.cwd(), '.test-session-workspace-integration');

describe('Session + Workspace Integration', () => {
  let workspaceManager: WorkspaceManager;
  let sessionManager: SessionManager;

  beforeEach(async () => {
    // 清理测试目录
    if (fs.existsSync(TEST_DIR)) {
      await fs.promises.rm(TEST_DIR, { recursive: true });
    }

    // 创建工作空间管理器
    workspaceManager = createWorkspaceManager({ path: TEST_DIR });
    await workspaceManager.initialize();

    // 创建会话管理器，关联工作空间
    sessionManager = createSessionManager({
      workspaceManager,
      autoSave: true,
      enableCompression: true,
    });
  });

  afterEach(async () => {
    // 清理测试目录
    if (fs.existsSync(TEST_DIR)) {
      await fs.promises.rm(TEST_DIR, { recursive: true });
    }
  });

  // ============================================
  // Full Workflow Tests
  // ============================================
  describe('Full Workflow', () => {
    it('should integrate SessionManager with WorkspaceManager', async () => {
      // 验证 SessionManager 获取了正确的 WorkspaceManager
      expect(sessionManager.getWorkspaceManager()).toBe(workspaceManager);

      // 验证存储路径来自工作空间的 sessions 根目录
      const storage = sessionManager.getStorage();
      const expectedPath = workspaceManager.getPaths().sessionsDir;
      expect(storage.getStorageDir()).toBe(expectedPath);
    });

    it('should create session in workspace session group', async () => {
      // 创建会话并添加消息
      const session = await sessionManager.createSession({
        title: 'Integration Test Session',
      });
      await sessionManager.addUserMessage('Hello from integration test');
      await sessionManager.addAssistantMessage('Hello! How can I help?');

      // 验证会话文件存在于工作空间的会话目录中
      const sessionFile = path.join(
        workspaceManager.getSessionsPath(),
        `${session.id}.json`
      );
      expect(fs.existsSync(sessionFile)).toBe(true);

      // 验证文件内容
      const content = await fs.promises.readFile(sessionFile, 'utf-8');
      const savedSession = JSON.parse(content);
      expect(savedSession.id).toBe(session.id);
      expect(savedSession.messages.length).toBe(2);
      expect(savedSession.metadata.title).toBe('Integration Test Session');
    });

    it('should persist session across manager instances', async () => {
      // 第一个管理器创建会话
      const session = await sessionManager.createSession({
        title: 'Persistent Session',
      });
      await sessionManager.addUserMessage('Message 1');
      await sessionManager.addAssistantMessage('Response 1');
      const sessionId = session.id;

      // 创建新的管理器实例（使用相同的工作空间）
      const newSessionManager = createSessionManager({
        workspaceManager,
      });

      // 加载会话
      const loadedSession = await newSessionManager.loadSession(sessionId);
      expect(loadedSession).not.toBeNull();
      expect(loadedSession?.id).toBe(sessionId);
      expect(loadedSession?.messages.length).toBe(2);
      expect(loadedSession?.metadata.title).toBe('Persistent Session');
    });

    it('should handle session group switching', async () => {
      // 创建新的会话组
      await workspaceManager.createSessionGroup('project-alpha');

      // 在默认组创建会话
      const defaultSession = await sessionManager.createSession({
        title: 'Default Group Session',
      });
      await sessionManager.addUserMessage('Message in default group');
      const defaultSessionId = defaultSession.id;

      // 切换到新组
      await sessionManager.setSessionGroup('project-alpha');

      // 验证当前组已更改
      expect(sessionManager.getCurrentSessionGroup()).toBe('project-alpha');
      expect(workspaceManager.getCurrentGroup()).toBe('project-alpha');

      // 在新组创建会话
      const alphaSession = await sessionManager.createSession({
        title: 'Alpha Group Session',
      });
      await sessionManager.addUserMessage('Message in alpha group');
      const alphaSessionId = alphaSession.id;

      // 验证两个会话存储在不同目录
      const defaultSessionFile = path.join(
        workspaceManager.getSessionsPath('default'),
        `${defaultSessionId}.json`
      );
      const alphaSessionFile = path.join(
        workspaceManager.getSessionsPath('project-alpha'),
        `${alphaSessionId}.json`
      );

      expect(fs.existsSync(defaultSessionFile)).toBe(true);
      expect(fs.existsSync(alphaSessionFile)).toBe(true);

      // 验证新组目录中没有默认组的会话
      const alphaDir = workspaceManager.getSessionsPath('project-alpha');
      const alphaFiles = await fs.promises.readdir(alphaDir);
      expect(alphaFiles).toContain(`${alphaSessionId}.json`);
      expect(alphaFiles).not.toContain(`${defaultSessionId}.json`);
    });
  });

  // ============================================
  // Multi-Group Scenarios
  // ============================================
  describe('Multi-Group Scenarios', () => {
    beforeEach(async () => {
      // 创建多个会话组
      await workspaceManager.createSessionGroup('work');
      await workspaceManager.createSessionGroup('personal');
    });

    it('should manage sessions in different groups', async () => {
      // 在 work 组创建会话
      await sessionManager.setSessionGroup('work');
      const workSession = await sessionManager.createSession({
        title: 'Work Project',
      });
      await sessionManager.addUserMessage('Work task 1');
      await sessionManager.addUserMessage('Work task 2');

      // 在 personal 组创建会话
      await sessionManager.setSessionGroup('personal');
      const personalSession = await sessionManager.createSession({
        title: 'Personal Notes',
      });
      await sessionManager.addUserMessage('Personal note 1');

      // 验证 work 组的会话数量
      const workStorage = sessionManager.getStorage();
      workStorage.setGroup('work');
      workStorage.setStorageDir(workspaceManager.getSessionsPath('work').replace('/work', ''));
      const workSessions = await sessionManager.listSessions();
      // 注意：listSessions 会列出当前组的会话

      // 直接检查文件系统
      const workDir = workspaceManager.getSessionsPath('work');
      const workFiles = (await fs.promises.readdir(workDir)).filter(f => f.endsWith('.json'));
      expect(workFiles.length).toBe(1);

      const personalDir = workspaceManager.getSessionsPath('personal');
      const personalFiles = (await fs.promises.readdir(personalDir)).filter(f => f.endsWith('.json'));
      expect(personalFiles.length).toBe(1);
    });

    it('should isolate sessions between groups', async () => {
      // 在默认组创建会话
      await sessionManager.setSessionGroup('default');
      const session1 = await sessionManager.createSession({ title: 'Session 1' });
      await sessionManager.addUserMessage('Default message');

      // 切换到 work 组
      await sessionManager.setSessionGroup('work');
      const session2 = await sessionManager.createSession({ title: 'Session 2' });
      await sessionManager.addUserMessage('Work message');

      // 切换回默认组，验证会话仍然存在
      await sessionManager.setSessionGroup('default');
      const loadedSession = await sessionManager.loadSession(session1.id);
      expect(loadedSession).not.toBeNull();
      expect(loadedSession?.messages[0].content).toBe('Default message');

      // 验证 work 组的会话不在默认组中
      const notFound = await sessionManager.loadSession(session2.id);
      expect(notFound).toBeNull();
    });

    it('should cleanup sessions in specific group', async () => {
      // 使用短 TTL 创建管理器
      const shortTtlManager = createSessionManager({
        workspaceManager,
        storage: { sessionTTL: 100 }, // 100ms
      });

      // 在默认组创建会话
      await shortTtlManager.setSessionGroup('default');
      await shortTtlManager.createSession({ title: 'To Expire' });
      await shortTtlManager.addUserMessage('Will be cleaned up');

      // 在 work 组创建会话
      await shortTtlManager.setSessionGroup('work');
      await shortTtlManager.createSession({ title: 'Work Session' });
      await shortTtlManager.addUserMessage('Should persist');

      // 等待 TTL 过期
      await new Promise(resolve => setTimeout(resolve, 150));

      // 清理默认组的过期会话
      await shortTtlManager.setSessionGroup('default');
      const defaultDeletedCount = await shortTtlManager.cleanup();
      expect(defaultDeletedCount).toBe(1);

      // 验证 work 组的会话仍然存在
      const workDir = workspaceManager.getSessionsPath('work');
      const workFiles = (await fs.promises.readdir(workDir)).filter(f => f.endsWith('.json'));
      expect(workFiles.length).toBe(1);
    });
  });

  // ============================================
  // Compression Integration
  // ============================================
  describe('Compression Integration', () => {
    it('should use workspace compression config', async () => {
      // 设置工作空间的会话配置
      await workspaceManager.updateConfig({
        session: {
          autoSave: true,
          autoCompress: true,
          compressionThreshold: 50,
        },
      });

      // 创建新的会话管理器（会读取工作空间配置）
      const configAwareManager = createSessionManager({
        workspaceManager,
        compression: {
          compression: {
            threshold: 50,
          },
        },
      });

      await configAwareManager.createSession();

      // 添加足够多的消息以触发压缩检查
      for (let i = 0; i < 60; i++) {
        await configAwareManager.addUserMessage(`Message ${i}`);
      }

      // 验证压缩被触发
      const needsCompress = configAwareManager.needsCompression();
      expect(needsCompress).toBe(true);

      // 执行压缩
      const result = await configAwareManager.compress();
      expect(result).not.toBeNull();
      expect(result?.tokensSaved).toBeGreaterThan(0);
    });

    it('should compress session with workspace integration', async () => {
      await sessionManager.createSession({ title: 'Compression Test' });

      // 添加大量消息
      for (let i = 0; i < 100; i++) {
        await sessionManager.addUserMessage(`User message ${i}`, 10);
        await sessionManager.addAssistantMessage(`Assistant response ${i}`, 20);
      }

      // 验证需要压缩
      expect(sessionManager.needsCompression()).toBe(true);

      // 执行压缩
      const compressionResult = await sessionManager.compress();
      expect(compressionResult).not.toBeNull();

      // 验证会话状态更新
      const session = sessionManager.getCurrentSession();
      expect(session?.compressionState).toBeDefined();
      expect(session?.compressionState?.tokensSaved).toBeGreaterThan(0);

      // 验证压缩后的会话被正确保存
      const sessionId = session!.id;
      const newManager = createSessionManager({ workspaceManager });
      const loadedSession = await newManager.loadSession(sessionId);

      expect(loadedSession?.compressionState).toBeDefined();
      expect(loadedSession?.compressionState?.tokensSaved).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe('Edge Cases', () => {
    it('should handle workspace without workspaceManager', async () => {
      // 创建没有工作空间管理器的 SessionManager
      const standaloneManager = createSessionManager({
        storage: { storageDir: TEST_DIR + '-standalone' },
      });

      // 验证没有工作空间管理器
      expect(standaloneManager.getWorkspaceManager()).toBeUndefined();

      // 应该仍能正常工作
      await standaloneManager.createSession({ title: 'Standalone Session' });
      await standaloneManager.addUserMessage('Hello standalone');

      expect(standaloneManager.getMessages().length).toBe(1);

      // 清理
      if (fs.existsSync(TEST_DIR + '-standalone')) {
        await fs.promises.rm(TEST_DIR + '-standalone', { recursive: true });
      }
    });

    it('should handle session storage path changes', async () => {
      // 创建初始会话
      await sessionManager.createSession({ title: 'Path Test' });
      await sessionManager.addUserMessage('Before path change');
      const sessionId = sessionManager.getCurrentSessionId()!;

      // 创建新的会话组并切换
      await workspaceManager.createSessionGroup('new-location');
      await sessionManager.setSessionGroup('new-location');

      // 创建新会话在新位置
      const newSession = await sessionManager.createSession({
        title: 'New Location Session',
      });
      await sessionManager.addUserMessage('After path change');

      // 验证旧会话仍在原位置
      const oldSessionFile = path.join(
        workspaceManager.getSessionsPath('default'),
        `${sessionId}.json`
      );
      expect(fs.existsSync(oldSessionFile)).toBe(true);

      // 验证新会话在新位置
      const newSessionFile = path.join(
        workspaceManager.getSessionsPath('new-location'),
        `${newSession.id}.json`
      );
      expect(fs.existsSync(newSessionFile)).toBe(true);
    });

    it('should handle workspace initialization after manager creation', async () => {
      // 创建未初始化的工作空间管理器
      const uninitializedWorkspace = createWorkspaceManager({
        path: TEST_DIR + '-late-init',
      });

      // 创建会话管理器（工作空间未初始化）
      const lateManager = createSessionManager({
        workspaceManager: uninitializedWorkspace,
      });

      // 初始化工作空间
      await uninitializedWorkspace.initialize();

      // 现在应该能正常工作
      await lateManager.createSession({ title: 'Late Init Session' });
      await lateManager.addUserMessage('After late init');

      expect(lateManager.getMessages().length).toBe(1);

      // 清理
      if (fs.existsSync(TEST_DIR + '-late-init')) {
        await fs.promises.rm(TEST_DIR + '-late-init', { recursive: true });
      }
    });

    it('should handle empty session groups', async () => {
      // 创建新组但不添加会话
      await workspaceManager.createSessionGroup('empty-group');
      await sessionManager.setSessionGroup('empty-group');

      // 列出会话应该返回空数组
      const sessions = await sessionManager.listSessions();
      expect(sessions.length).toBe(0);

      // 恢复最近会话应该返回 null
      const resumed = await sessionManager.resumeLastSession();
      expect(resumed).toBeNull();
    });

    it('should sync group state between managers', async () => {
      // 创建两个使用相同工作空间的管理器
      const manager1 = createSessionManager({ workspaceManager });
      const manager2 = createSessionManager({ workspaceManager });

      // manager1 切换组
      await workspaceManager.createSessionGroup('sync-test');
      await manager1.setSessionGroup('sync-test');

      // manager2 也应该能看到组的变化
      const groups = workspaceManager.getSessionGroups();
      expect(groups.map(g => g.name)).toContain('sync-test');

      // 但 manager2 的当前组不受影响（独立实例）
      expect(manager2.getCurrentSessionGroup()).toBe('default');
    });
  });

  // ============================================
  // Resume and Recovery Tests
  // ============================================
  describe('Resume and Recovery', () => {
    it('should resume last session in workspace context', async () => {
      // 创建多个会话
      const session1 = await sessionManager.createSession({ title: 'First' });
      await sessionManager.addUserMessage('First message');
      await sessionManager.save();

      await new Promise(resolve => setTimeout(resolve, 10));

      const session2 = await sessionManager.createSession({ title: 'Second' });
      await sessionManager.addUserMessage('Second message');
      await sessionManager.save();

      // 创建新管理器并恢复
      const newManager = createSessionManager({ workspaceManager });
      const resumed = await newManager.resumeLastSession();

      expect(resumed).not.toBeNull();
      expect(resumed?.metadata.title).toBe('Second');
    });

    it('should handle resume across different groups', async () => {
      // 在默认组创建会话
      await sessionManager.createSession({ title: 'Default Session' });
      await sessionManager.addUserMessage('Default');
      await sessionManager.save();

      // 创建新组并创建会话
      await workspaceManager.createSessionGroup('project-beta');
      await sessionManager.setSessionGroup('project-beta');
      await sessionManager.createSession({ title: 'Beta Session' });
      await sessionManager.addUserMessage('Beta');
      await sessionManager.save();

      // 在 project-beta 组恢复
      const betaManager = createSessionManager({ workspaceManager });
      await betaManager.setSessionGroup('project-beta');
      const resumedBeta = await betaManager.resumeLastSession();

      expect(resumedBeta).not.toBeNull();
      expect(resumedBeta?.metadata.title).toBe('Beta Session');
    });
  });

  // ============================================
  // Error Handling Integration
  // ============================================
  describe('Error Handling Integration', () => {
    it('should handle invalid session group gracefully', async () => {
      // 尝试切换到不存在的组
      await expect(sessionManager.setSessionGroup('non-existent')).rejects.toThrow();
    });

    it('should handle corrupted session files', async () => {
      // 创建一个有效的会话
      const session = await sessionManager.createSession({ title: 'Valid' });
      await sessionManager.addUserMessage('Valid message');

      // 手动创建一个损坏的会话文件
      const sessionPath = path.join(
        workspaceManager.getSessionsPath(),
        'corrupted-session.json'
      );
      await fs.promises.writeFile(sessionPath, 'invalid json content', 'utf-8');

      // 列出会话应该跳过损坏的文件
      const sessions = await sessionManager.listSessions();
      const corruptedFound = sessions.find(s => s.id === 'corrupted-session');
      expect(corruptedFound).toBeUndefined();

      // 有效会话仍应存在
      const validFound = sessions.find(s => s.id === session.id);
      expect(validFound).toBeDefined();
    });

    it('should handle workspace deletion during operation', async () => {
      // 创建会话
      await sessionManager.createSession();
      await sessionManager.addUserMessage('Test');

      // 删除工作空间目录
      await fs.promises.rm(TEST_DIR, { recursive: true });

      // 尝试保存应该重新创建目录
      await sessionManager.save();

      // 目录应该被重新创建
      expect(fs.existsSync(workspaceManager.getSessionsPath())).toBe(true);
    });
  });
});
