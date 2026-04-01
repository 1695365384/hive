/**
 * Test Helpers for SQLite Storage
 *
 * 提供测试用的 Repository mock 和 fixture
 */

import { randomUUID } from 'crypto';
import type { Session, Message, SessionListItem } from '../../src/session/types.js';
import type { ISessionRepository } from '../../src/storage/SessionRepository.js';
import type { IMemoryRepository, MemoryEntry } from '../../src/storage/MemoryRepository.js';

/**
 * Helper to ensure date is a Date object
 */
function toDate(date: Date | string): Date {
  return date instanceof Date ? date : new Date(date);
}

/**
 * Deep clone session with proper Date objects
 */
function cloneSession(session: Session): Session {
  return {
    ...session,
    createdAt: toDate(session.createdAt),
    updatedAt: toDate(session.updatedAt),
    messages: session.messages.map(msg => ({
      ...msg,
      timestamp: toDate(msg.timestamp),
    })),
  };
}

/**
 * In-memory Session Repository for testing
 */
export class MockSessionRepository implements ISessionRepository {
  private sessions: Map<string, Session> = new Map();

  async save(session: Session): Promise<void> {
    // Store a clone with proper Date objects
    this.sessions.set(session.id, cloneSession(session));
  }

  async load(sessionId: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);
    return session ? cloneSession(session) : null;
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async list(group?: string, limit?: number, offset?: number): Promise<SessionListItem[]> {
    let items = Array.from(this.sessions.values());

    // Sort by updatedAt desc
    items.sort((a, b) => toDate(b.updatedAt).getTime() - toDate(a.updatedAt).getTime());

    // Apply pagination
    const start = offset ?? 0;
    const end = limit ? start + limit : undefined;
    items = items.slice(start, end);

    return items.map(s => ({
      id: s.id,
      title: s.metadata.title,
      createdAt: toDate(s.createdAt),
      updatedAt: toDate(s.updatedAt),
      messageCount: s.metadata.messageCount,
      totalTokens: s.metadata.totalTokens,
    }));
  }

  async getMostRecent(): Promise<Session | null> {
    const sessions = await this.list();
    if (sessions.length === 0) return null;
    return this.load(sessions[0].id);
  }

  exists(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Create a test session
   */
  createTestSession(overrides?: Partial<Session>): Session {
    const now = new Date();
    return {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      messages: [],
      metadata: {
        totalTokens: 0,
        messageCount: 0,
        compressionCount: 0,
        ...overrides?.metadata,
      },
      ...overrides,
    };
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    this.sessions.clear();
  }
}

/**
 * In-memory Memory Repository for testing
 */
export class MockMemoryRepository implements IMemoryRepository {
  private memories: Map<string, MemoryEntry> = new Map();

  async set(key: string, entry: Omit<MemoryEntry, 'key'>): Promise<void> {
    this.memories.set(key, { ...entry, key });
  }

  async get(key: string): Promise<MemoryEntry | null> {
    return this.memories.get(key) ?? null;
  }

  async getAll(): Promise<Record<string, MemoryEntry>> {
    const result: Record<string, MemoryEntry> = {};
    for (const [k, v] of this.memories) {
      result[k] = v;
    }
    return result;
  }

  async getByTag(tag: string): Promise<MemoryEntry[]> {
    return Array.from(this.memories.values()).filter(
      e => e.tags?.includes(tag)
    );
  }

  async delete(key: string): Promise<boolean> {
    return this.memories.delete(key);
  }

  async clear(): Promise<void> {
    this.memories.clear();
  }
}

/**
 * Create a test session manager with mock repository
 */
export async function createTestSessionManager(options?: {
  autoSave?: boolean;
  enableCompression?: boolean;
}) {
  const { SessionManager } = await import('../../src/session/SessionManager.js');
  const repository = new MockSessionRepository();

  return {
    sessionManager: new SessionManager({
      repository,
      autoSave: options?.autoSave ?? true,
      enableCompression: options?.enableCompression ?? false,
    }),
    repository,
  };
}

/**
 * Create test messages
 */
export function createTestMessages(count: number, role: 'user' | 'assistant' = 'user'): Message[] {
  const messages: Message[] = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      id: `msg_${i}`,
      role,
      content: `Test message ${i}`,
      timestamp: new Date(),
      tokenCount: 10,
    });
  }
  return messages;
}
