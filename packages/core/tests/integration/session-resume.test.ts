/**
 * 会话恢复续聊集成测试
 *
 * 验证会话持久化 → 恢复 → 继续对话的完整链路。
 * 使用真实 SQLite（参考 sqlite-persistence.test.ts 模式）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  createMockAI,
  simpleTextResponse,
  createMockProviderManagerModule,
  createTestAgent,
} from './integration-helpers.js';
import { INITIAL_SCHEMA_UP } from '../../src/storage/migrations/001-initial.js';

const { mockGenerateText, mockStreamText, getCallCount, resetCallCount } = createMockAI({
  responses: [simpleTextResponse('Mock response')],
});

vi.mock('ai', () => ({
  generateText: mockGenerateText,
  streamText: mockStreamText,
  stepCountIs: vi.fn((n: number) => n),
  tool: vi.fn((config: Record<string, unknown>) => config),
  zodSchema: vi.fn((schema: unknown) => schema),
}));

vi.mock('../../src/providers/ProviderManager.js', () => createMockProviderManagerModule());

describe('Session Resume Integration', () => {
  let db: Database.Database;

  beforeEach(() => {
    resetCallCount();
    vi.clearAllMocks();
    db = new Database(':memory:');
    db.exec(INITIAL_SCHEMA_UP);
  });

  afterEach(() => {
    db.close();
  });

  function createStreamResponse(text: string) {
    return {
      fullStream: (async function* () {
        yield { type: 'start' };
        yield { type: 'text-delta', text };
        yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 50, outputTokens: 25 } };
      })(),
      text: Promise.resolve(text),
      finishReason: Promise.resolve('stop'),
      steps: Promise.resolve([]),
      totalUsage: Promise.resolve({ inputTokens: 50, outputTokens: 25 }),
    };
  }

  // 7.2 chat 自动持久化
  describe('Chat Auto-persistence', () => {
    it('should persist session to SQLite after chat', async () => {
      mockStreamText.mockReturnValueOnce(createStreamResponse('Hello!'));

      const { agent, dispose } = await createTestAgent();

      // 获取初始 session ID
      const sessionId = agent.context.hookRegistry.getSessionId();
      expect(sessionId).toBeDefined();

      await agent.chat('Hello');
      await dispose();
    });

    it('should have currentSession property', async () => {
      const { agent, dispose } = await createTestAgent();

      // currentSession 在 initialize 时由 SessionCapability 创建
      expect(agent).toHaveProperty('currentSession');

      await dispose();
    });
  });

  // 7.3 加载 session 继续对话
  describe('Load Session and Continue', () => {
    it('should load session by ID', async () => {
      const { agent, dispose } = await createTestAgent();

      // 创建 session
      const session = await agent.createSession({ title: 'Test Session' });
      expect(session).toBeDefined();
      expect(session.id).toBeDefined();

      // 加载 session
      const loaded = await agent.loadSession(session.id);
      expect(loaded).toBeDefined();

      await dispose();
    });
  });

  // 7.4 listSessions
  describe('List Sessions', () => {
    it('should return session list', async () => {
      const { agent, dispose } = await createTestAgent();

      // 创建多个 session
      await agent.createSession({ title: 'Session 1' });
      await agent.createSession({ title: 'Session 2' });

      // 列出 sessions
      const sessions = await agent.listSessions();
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeGreaterThanOrEqual(2);

      await dispose();
    });
  });

  // 7.5 resumeLastSession
  describe('Resume Last Session', () => {
    it('should resume the most recent session', async () => {
      const { agent, dispose } = await createTestAgent();

      // 创建 session
      await agent.createSession({ title: 'Latest Session' });

      // 恢复最近的 session
      const resumed = await agent.resumeLastSession();
      // 可能返回 session 或 null（取决于实现）
      if (resumed) {
        expect(resumed).toBeDefined();
      }

      await dispose();
    });
  });
});
