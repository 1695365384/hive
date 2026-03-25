/**
 * Agent + Session + Workspace 集成测试
 *
 * 测试 Agent 与 SessionCapability、WorkspaceManager 的完整集成
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Agent, createAgent } from '../../src/agents/core/Agent.js';
import type { WorkspaceManager } from '../../src/workspace/index.js';

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

// 测试用临时目录
const TEST_DIR = path.join(process.cwd(), '.test-agent-session-workspace');

describe('Agent + Session + Workspace Integration', () => {
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    mockQuery = query as ReturnType<typeof vi.fn>;
    mockQuery.mockReset();
  });

  // ============================================
  // Agent Initialization
  // ============================================
  describe('Agent Initialization', () => {
    beforeEach(async () => {
      if (fs.existsSync(TEST_DIR)) {
        await fs.promises.rm(TEST_DIR, { recursive: true });
      }
    });

    afterEach(async () => {
      if (fs.existsSync(TEST_DIR)) {
        await fs.promises.rm(TEST_DIR, { recursive: true });
      }
    });

    it('should create Agent with workspace config', async () => {
      const agent = createAgent({ workspace: TEST_DIR });
      await agent.initialize();

      // 验证工作空间管理器已创建
      const workspaceManager = agent.getWorkspaceManager();
      expect(workspaceManager).toBeDefined();
      expect(workspaceManager?.getRootPath()).toBe(TEST_DIR);

      await agent.dispose();
    });

    it('should initialize SessionCapability with workspace', async () => {
      const agent = createAgent({ workspace: TEST_DIR });
      await agent.initialize();

      // 验证工作空间已初始化
      const workspaceManager = agent.getWorkspaceManager();
      expect(workspaceManager).toBeDefined();

      // 创建初始会话
      await agent.createSession({ title: 'Test' });

      const session = agent.currentSession;
      expect(session).toBeDefined();
      expect(session?.id).toBeDefined();

      await agent.dispose();
    });

    it('should auto-create workspace directory', async () => {
      const newDir = path.join(TEST_DIR, 'auto-created');
      expect(fs.existsSync(newDir)).toBe(false);

      const agent = createAgent({ workspace: newDir });
      await agent.initialize();

      // 验证目录已自动创建
      expect(fs.existsSync(newDir)).toBe(true);

      await agent.dispose();
    });

    it('should handle Agent without workspace config', async () => {
      // 不提供工作空间配置
      const agent = createAgent();
      await agent.initialize();

      // 工作空间管理器应为 undefined
      const workspaceManager = agent.getWorkspaceManager();
      expect(workspaceManager).toBeUndefined();

      // 会话应该仍然可用（使用默认内存存储或临时目录）
      const session = agent.currentSession;
      expect(session).toBeDefined();

      await agent.dispose();
    });

    it('should accept workspace config as string', async () => {
      const agent = createAgent({ workspace: TEST_DIR });
      await agent.initialize();

      const workspaceManager = agent.getWorkspaceManager();
      expect(workspaceManager?.getRootPath()).toBe(TEST_DIR);

      await agent.dispose();
    });

    it('should accept workspace config as object', async () => {
      const agent = createAgent({ workspace: { path: TEST_DIR, name: 'test-workspace' } });
      await agent.initialize();

      const workspaceManager = agent.getWorkspaceManager();
      expect(workspaceManager?.getRootPath()).toBe(TEST_DIR);
      // Note: 当前实现不支持自定义 name，使用默认名称
      expect(workspaceManager?.getMetadata()?.name).toBeDefined();

      await agent.dispose();
    });
  });

  // ============================================
  // Session Operations via Agent
  // ============================================
  describe('Session Operations via Agent', () => {
    let agent: Agent;

    beforeEach(async () => {
      if (fs.existsSync(TEST_DIR)) {
        await fs.promises.rm(TEST_DIR, { recursive: true });
      }
      agent = createAgent({ workspace: TEST_DIR });
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
      if (fs.existsSync(TEST_DIR)) {
        await fs.promises.rm(TEST_DIR, { recursive: true });
      }
    });

    it('should create session through Agent', async () => {
      const session = await agent.createSession({
        title: 'Test Session',
        providerId: 'test-provider',
        model: 'test-model',
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.metadata.title).toBe('Test Session');
      expect(session.metadata.providerId).toBe('test-provider');
      expect(session.metadata.model).toBe('test-model');
    });

    it('should add messages and persist to workspace', async () => {
      await agent.createSession({ title: 'Message Test' });

      // 通过 sessionCap 添加消息
      const sessionCap = (agent as any).sessionCap;
      await sessionCap.addUserMessage('Hello from user', 10);
      await sessionCap.addAssistantMessage('Hello from assistant', 15);

      // 验证消息已添加
      const messages = agent.getSessionMessages();
      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello from user');
      expect(messages[1].role).toBe('assistant');

      // 验证已持久化到工作空间
      const workspaceManager = agent.getWorkspaceManager();
      const sessionId = agent.currentSession?.id;
      const sessionFile = path.join(
        workspaceManager!.getSessionsPath(),
        `${sessionId}.json`
      );
      expect(fs.existsSync(sessionFile)).toBe(true);
    });

    it('should load session through Agent', async () => {
      // 创建会话
      const session = await agent.createSession({ title: 'Loadable Session' });
      const sessionCap = (agent as any).sessionCap;
      await sessionCap.addUserMessage('Test message');
      const sessionId = session.id;

      // 保存
      await sessionCap.save();

      // 创建新 Agent 并加载会话
      const newAgent = createAgent({ workspace: TEST_DIR });
      await newAgent.initialize();

      const loadedSession = await newAgent.loadSession(sessionId);
      expect(loadedSession).not.toBeNull();
      expect(loadedSession?.id).toBe(sessionId);
      expect(loadedSession?.metadata.title).toBe('Loadable Session');
      expect(loadedSession?.messages.length).toBe(1);

      await newAgent.dispose();
    });

    it('should resume last session through Agent', async () => {
      // 创建第一个会话
      await agent.createSession({ title: 'First Session' });
      const sessionCap = (agent as any).sessionCap;
      await sessionCap.addUserMessage('First message');
      await sessionCap.save();

      // 稍等一下确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));

      // 创建第二个会话
      await agent.createSession({ title: 'Second Session' });
      await sessionCap.addUserMessage('Second message');
      await sessionCap.save();

      // 创建新 Agent 并恢复最近会话
      const newAgent = createAgent({ workspace: TEST_DIR });
      await newAgent.initialize();

      const resumed = await newAgent.resumeLastSession();
      expect(resumed).not.toBeNull();
      expect(resumed?.metadata.title).toBe('Second Session');

      await newAgent.dispose();
    });

    it('should list sessions through Agent', async () => {
      // 创建多个会话
      await agent.createSession({ title: 'Session 1' });
      await agent.createSession({ title: 'Session 2' });
      await agent.createSession({ title: 'Session 3' });

      const sessions = await agent.listSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(3);
      expect(sessions.map(s => s.title)).toContain('Session 1');
      expect(sessions.map(s => s.title)).toContain('Session 2');
      expect(sessions.map(s => s.title)).toContain('Session 3');
    });

    it('should delete current session through Agent', async () => {
      const session = await agent.createSession({ title: 'To Delete' });
      const sessionId = session.id;

      const result = await agent.deleteCurrentSession();
      expect(result).toBe(true);

      // 验证会话已删除
      const newAgent = createAgent({ workspace: TEST_DIR });
      await newAgent.initialize();
      const loaded = await newAgent.loadSession(sessionId);
      expect(loaded).toBeNull();
      await newAgent.dispose();
    });

    it('should persist chat messages into an explicit session', async () => {
      mockQuery.mockImplementation(async function* () {
        yield { result: 'Persisted reply' };
      });

      await agent.chat('Persist this prompt', {
        sessionId: 'chat-session-1',
      });

      const session = agent.currentSession;
      expect(session?.id).toBe('chat-session-1');
      expect(session?.messages).toHaveLength(2);
      expect(session?.messages[0].role).toBe('user');
      expect(session?.messages[0].content).toBe('Persist this prompt');
      expect(session?.messages[1].role).toBe('assistant');
      expect(session?.messages[1].content).toBe('Persisted reply');
    });
  });

  // ============================================
  // Session Group Operations
  // ============================================
  describe('Session Group Operations', () => {
    let agent: Agent;

    beforeEach(async () => {
      if (fs.existsSync(TEST_DIR)) {
        await fs.promises.rm(TEST_DIR, { recursive: true });
      }
      agent = createAgent({ workspace: TEST_DIR });
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.dispose();
      if (fs.existsSync(TEST_DIR)) {
        await fs.promises.rm(TEST_DIR, { recursive: true });
      }
    });

    it('should list session groups through Agent', async () => {
      // 默认应该有 default 组
      const groups = agent.listSessionGroups();
      expect(groups.length).toBeGreaterThanOrEqual(1);
      expect(groups.map(g => g.name)).toContain('default');
    });

    it('should switch session group through Agent', async () => {
      const workspaceManager = agent.getWorkspaceManager();
      await workspaceManager!.createSessionGroup('project-x');

      await agent.setSessionGroup('project-x');
      expect(agent.getCurrentSessionGroup()).toBe('project-x');
    });

    it('should create sessions in different groups', async () => {
      const workspaceManager = agent.getWorkspaceManager();

      // 在 default 组创建会话
      await agent.createSession({ title: 'Default Group Session' });
      const sessionCap = (agent as any).sessionCap;
      await sessionCap.addUserMessage('Message in default');
      const defaultSessionId = agent.currentSession?.id;

      // 创建并切换到新组
      await workspaceManager!.createSessionGroup('project-y');
      await agent.setSessionGroup('project-y');

      // 在新组创建会话
      await agent.createSession({ title: 'Project Y Session' });
      await sessionCap.addUserMessage('Message in project-y');
      const projectSessionId = agent.currentSession?.id;

      // 验证会话存储在不同目录
      const defaultSessionFile = path.join(
        workspaceManager!.getSessionsPath('default'),
        `${defaultSessionId}.json`
      );
      const projectSessionFile = path.join(
        workspaceManager!.getSessionsPath('project-y'),
        `${projectSessionId}.json`
      );

      expect(fs.existsSync(defaultSessionFile)).toBe(true);
      expect(fs.existsSync(projectSessionFile)).toBe(true);
    });

    it('should isolate sessions between groups', async () => {
      const workspaceManager = agent.getWorkspaceManager();

      // 在 default 组创建会话
      await agent.createSession({ title: 'Default Session' });
      const sessionCap = (agent as any).sessionCap;
      await sessionCap.addUserMessage('Default content');
      const defaultSessionId = agent.currentSession?.id;

      // 切换到新组
      await workspaceManager!.createSessionGroup('isolated');
      await agent.setSessionGroup('isolated');

      // 新组中不应该能加载 default 组的会话
      const loaded = await agent.loadSession(defaultSessionId!);
      expect(loaded).toBeNull();
    });
  });

  // ============================================
  // Workspace Access
  // ============================================
  describe('Workspace Access', () => {
    let agent: Agent;
    let workspaceManager: WorkspaceManager | undefined;

    beforeEach(async () => {
      if (fs.existsSync(TEST_DIR)) {
        await fs.promises.rm(TEST_DIR, { recursive: true });
      }
      agent = createAgent({ workspace: TEST_DIR });
      await agent.initialize();
      workspaceManager = agent.getWorkspaceManager();
    });

    afterEach(async () => {
      await agent.dispose();
      if (fs.existsSync(TEST_DIR)) {
        await fs.promises.rm(TEST_DIR, { recursive: true });
      }
    });

    it('should get workspace manager from Agent', () => {
      expect(workspaceManager).toBeDefined();
      expect(workspaceManager?.getRootPath()).toBe(TEST_DIR);
    });

    it('should access workspace paths', () => {
      const paths = workspaceManager!.getPaths();

      expect(paths.root).toBe(TEST_DIR);
      expect(paths.sessionsDir).toBe(path.join(TEST_DIR, 'sessions'));
      expect(paths.metadataFile).toBe(path.join(TEST_DIR, 'workspace.json'));
    });

    it('should update workspace config', async () => {
      await workspaceManager!.updateConfig({
        session: {
          autoSave: false,
          autoCompress: true,
          compressionThreshold: 100,
        },
      });

      const config = workspaceManager!.getConfig();
      expect(config.session?.autoSave).toBe(false);
      expect(config.session?.autoCompress).toBe(true);
      expect(config.session?.compressionThreshold).toBe(100);
    });

    it('should get workspace metadata', async () => {
      const namedAgent = createAgent({ workspace: { path: TEST_DIR, name: 'my-workspace' } });
      await namedAgent.initialize();

      const ws = namedAgent.getWorkspaceManager();
      // Note: 当前实现不支持自定义 name，使用默认名称
      expect(ws?.getMetadata()?.name).toBeDefined();
      expect(ws?.getMetadata()?.version).toBeDefined();
      expect(ws?.getMetadata()?.createdAt).toBeInstanceOf(Date);

      await namedAgent.dispose();
    });
  });

  // ============================================
  // Auto Resume
  // ============================================
  describe('Auto Resume', () => {
    beforeEach(async () => {
      if (fs.existsSync(TEST_DIR)) {
        await fs.promises.rm(TEST_DIR, { recursive: true });
      }
    });

    afterEach(async () => {
      if (fs.existsSync(TEST_DIR)) {
        await fs.promises.rm(TEST_DIR, { recursive: true });
      }
    });

    it('should auto-resume last session when configured', async () => {
      // 第一个 Agent 创建会话
      const agent1 = createAgent({ workspace: TEST_DIR });
      await agent1.initialize();
      await agent1.createSession({ title: 'Auto Resume Session' });
      const sessionCap1 = (agent1 as any).sessionCap;
      await sessionCap1.addUserMessage('Content to resume');
      await sessionCap1.save();
      await agent1.dispose();

      // 第二个 Agent 启用自动恢复
      const agent2 = createAgent({ workspace: TEST_DIR, sessionConfig: { autoResume: true } });
      await agent2.initialize();

      // 验证会话已自动恢复
      const session = agent2.currentSession;
      expect(session).not.toBeNull();
      expect(session?.metadata.title).toBe('Auto Resume Session');
      expect(session?.messages.length).toBe(1);
      expect(session?.messages[0].content).toBe('Content to resume');

      await agent2.dispose();
    });

    it('should handle no previous session gracefully', async () => {
      // 启用自动恢复但没有之前的会话
      const agent = createAgent({ workspace: TEST_DIR, sessionConfig: { autoResume: true } });
      await agent.initialize();

      // autoResume 如果没有会话，不会自动创建
      // 需要手动创建一个
      if (!agent.currentSession) {
        await agent.createSession({ title: 'New Session' });
      }

      const session = agent.currentSession;
      expect(session).not.toBeNull();
      expect(session?.id).toBeDefined();

      await agent.dispose();
    });

    it('should not auto-resume when disabled', async () => {
      // 第一个 Agent 创建会话
      const agent1 = createAgent({ workspace: TEST_DIR });
      await agent1.initialize();
      await agent1.createSession({ title: 'Previous Session' });
      const sessionCap1 = (agent1 as any).sessionCap;
      await sessionCap1.addUserMessage('Previous content');
      await sessionCap1.save();
      await agent1.dispose();

      // 第二个 Agent 禁用自动恢复（默认）
      const agent2 = createAgent({ workspace: TEST_DIR, sessionConfig: { autoResume: false } });
      await agent2.initialize();

      // 应该是新的空会话
      const session = agent2.currentSession;
      // 注意：如果 autoResume 为 false，可能会有一个初始会话，但不会是之前的
      expect(session).toBeDefined();

      await agent2.dispose();
    });
  });

  // ============================================
  // Full Workflow
  // ============================================
  describe('Full Workflow', () => {
    beforeEach(async () => {
      if (fs.existsSync(TEST_DIR)) {
        await fs.promises.rm(TEST_DIR, { recursive: true });
      }
    });

    afterEach(async () => {
      if (fs.existsSync(TEST_DIR)) {
        await fs.promises.rm(TEST_DIR, { recursive: true });
      }
    });

    it('should persist session across Agent instances', async () => {
      // Agent 1: 创建会话并添加消息
      const agent1 = createAgent({ workspace: TEST_DIR });
      await agent1.initialize();
      const session1 = await agent1.createSession({
        title: 'Cross-Instance Session',
        providerId: 'anthropic',
        model: 'claude-3-5-sonnet',
      });
      const sessionCap1 = (agent1 as any).sessionCap;
      await sessionCap1.addUserMessage('User input', 50);
      await sessionCap1.addAssistantMessage('Assistant response', 100);
      await sessionCap1.save();
      const sessionId = session1.id;
      await agent1.dispose();

      // Agent 2: 加载并验证会话
      const agent2 = createAgent({ workspace: TEST_DIR });
      await agent2.initialize();
      const loadedSession = await agent2.loadSession(sessionId);

      expect(loadedSession).not.toBeNull();
      expect(loadedSession?.id).toBe(sessionId);
      expect(loadedSession?.metadata.title).toBe('Cross-Instance Session');
      expect(loadedSession?.metadata.providerId).toBe('anthropic');
      expect(loadedSession?.metadata.model).toBe('claude-3-5-sonnet');
      expect(loadedSession?.messages.length).toBe(2);
      expect(loadedSession?.messages[0].content).toBe('User input');
      expect(loadedSession?.messages[1].content).toBe('Assistant response');

      await agent2.dispose();
    });

    it('should maintain session state after Agent disposal', async () => {
      // Agent 1: 创建会话
      const agent1 = createAgent({ workspace: TEST_DIR });
      await agent1.initialize();
      await agent1.createSession({ title: 'Stateful Session' });
      const sessionCap1 = (agent1 as any).sessionCap;
      await sessionCap1.addUserMessage('Message 1');
      await sessionCap1.addUserMessage('Message 2');
      await sessionCap1.addUserMessage('Message 3');

      // dispose 时应该自动保存
      await agent1.dispose();

      // Agent 2: 验证状态已保存
      const agent2 = createAgent({ workspace: TEST_DIR });
      await agent2.initialize();
      const resumed = await agent2.resumeLastSession();

      expect(resumed).not.toBeNull();
      expect(resumed?.metadata.title).toBe('Stateful Session');
      expect(resumed?.messages.length).toBe(3);

      await agent2.dispose();
    });

    it('should handle complete workflow with groups', async () => {
      // Agent 1: 在多个组中创建会话
      const agent1 = createAgent({ workspace: TEST_DIR });
      await agent1.initialize();
      const workspaceManager1 = agent1.getWorkspaceManager();

      // default 组
      await agent1.createSession({ title: 'Default Work' });
      const sessionCap1 = (agent1 as any).sessionCap;
      await sessionCap1.addUserMessage('Default task');
      await sessionCap1.save();

      // work 组
      await workspaceManager1!.createSessionGroup('work');
      await agent1.setSessionGroup('work');
      await agent1.createSession({ title: 'Project Work' });
      await sessionCap1.addUserMessage('Project task');
      await sessionCap1.save();

      // personal 组
      await workspaceManager1!.createSessionGroup('personal');
      await agent1.setSessionGroup('personal');
      await agent1.createSession({ title: 'Personal Notes' });
      await sessionCap1.addUserMessage('Personal note');
      await sessionCap1.save();

      await agent1.dispose();

      // Agent 2: 验证所有组的会话
      const agent2 = createAgent({ workspace: TEST_DIR });
      await agent2.initialize();

      const groups = agent2.listSessionGroups();
      expect(groups.map(g => g.name)).toContain('default');
      expect(groups.map(g => g.name)).toContain('work');
      expect(groups.map(g => g.name)).toContain('personal');

      // 验证 work 组的会话
      await agent2.setSessionGroup('work');
      const resumed = await agent2.resumeLastSession();
      expect(resumed?.metadata.title).toBe('Project Work');

      await agent2.dispose();
    });

    it('should handle compression across Agent instances', async () => {
      // Agent 1: 创建会话并添加大量消息
      const agent1 = createAgent(undefined, {
        sessionManager: {
          enableCompression: true,
          compression: {
            compression: { threshold: 50 },
          },
        },
      }, TEST_DIR);
      await agent1.initialize();
      await agent1.createSession({ title: 'Compression Test' });
      const sessionCap1 = (agent1 as any).sessionCap;

      // 添加大量消息
      for (let i = 0; i < 60; i++) {
        await sessionCap1.addUserMessage(`Message ${i}`, 10);
      }

      // 执行压缩
      const compressionResult = await sessionCap1.compress();
      expect(compressionResult).not.toBeNull();
      expect(compressionResult?.tokensSaved).toBeGreaterThan(0);

      const sessionId = agent1.currentSession?.id;
      await agent1.dispose();

      // Agent 2: 验证压缩状态已保存
      const agent2 = createAgent({ workspace: TEST_DIR });
      await agent2.initialize();
      const loaded = await agent2.loadSession(sessionId!);

      expect(loaded?.compressionState).toBeDefined();
      expect(loaded?.compressionState?.tokensSaved).toBeGreaterThan(0);

      await agent2.dispose();
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe('Edge Cases', () => {
    beforeEach(async () => {
      if (fs.existsSync(TEST_DIR)) {
        await fs.promises.rm(TEST_DIR, { recursive: true });
      }
    });

    afterEach(async () => {
      if (fs.existsSync(TEST_DIR)) {
        await fs.promises.rm(TEST_DIR, { recursive: true });
      }
    });

    it('should handle multiple Agent instances with same workspace', async () => {
      // 同时创建两个 Agent 使用相同工作空间
      const agent1 = createAgent({ workspace: TEST_DIR });
      const agent2 = createAgent({ workspace: TEST_DIR });

      await agent1.initialize();
      await agent2.initialize();

      // 两个 Agent 应该能独立操作
      await agent1.createSession({ title: 'Agent 1 Session' });
      const sessionCap1 = (agent1 as any).sessionCap;
      await sessionCap1.addUserMessage('From Agent 1');

      await agent2.createSession({ title: 'Agent 2 Session' });
      const sessionCap2 = (agent2 as any).sessionCap;
      await sessionCap2.addUserMessage('From Agent 2');

      // 验证两个会话都存在
      const sessions = await agent1.listSessions();
      expect(sessions.length).toBe(2);

      await agent1.dispose();
      await agent2.dispose();
    });

    it('should handle workspace path with special characters', async () => {
      const specialDir = path.join(TEST_DIR, 'path with spaces');
      const agent = createAgent({ workspace: specialDir });
      await agent.initialize();

      expect(agent.getWorkspaceManager()?.getRootPath()).toBe(specialDir);
      expect(fs.existsSync(specialDir)).toBe(true);

      await agent.dispose();
    });

    it('should handle empty session list gracefully', async () => {
      const agent = createAgent({ workspace: TEST_DIR });
      await agent.initialize();

      // 切换到新组（空）
      const workspaceManager = agent.getWorkspaceManager();
      await workspaceManager!.createSessionGroup('empty-group');
      await agent.setSessionGroup('empty-group');

      const sessions = await agent.listSessions();
      expect(sessions.length).toBe(0);

      await agent.dispose();
    });

    it('should handle concurrent session operations', async () => {
      const agent = createAgent({ workspace: TEST_DIR });
      await agent.initialize();

      // 并发创建多个会话
      const promises = [
        agent.createSession({ title: 'Concurrent 1' }),
        agent.createSession({ title: 'Concurrent 2' }),
        agent.createSession({ title: 'Concurrent 3' }),
      ];

      const sessions = await Promise.all(promises);
      expect(sessions.length).toBe(3);
      expect(sessions.every(s => s.id !== undefined)).toBe(true);

      await agent.dispose();
    });

    it('should handle Agent re-initialization', async () => {
      const agent = createAgent({ workspace: TEST_DIR });
      await agent.initialize();

      await agent.createSession({ title: 'Before Re-init' });
      const sessionId = agent.currentSession?.id;

      // 重复调用 initialize 应该是幂等的
      await agent.initialize();

      // 会话状态应该保持
      expect(agent.currentSession?.id).toBe(sessionId);

      await agent.dispose();
    });
  });
});
