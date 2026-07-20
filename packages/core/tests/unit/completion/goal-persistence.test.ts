/**
 * Goal SQLite persistence + restart hydrate
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MigrationRunner } from '../../../src/storage/MigrationRunner.js';
import { createGoalRepository } from '../../../src/storage/GoalRepository.js';
import { GoalStore } from '../../../src/agents/completion/GoalStore.js';
import '../../../src/storage/migrations/index.js';

describe('Goal persistence', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = new Database(':memory:');
    const runner = new MigrationRunner(db);
    await runner.runPending();
  });

  afterEach(() => {
    db.close();
  });

  it('persists Goal mutations to SQLite', () => {
    const repo = createGoalRepository(db);
    const store = new GoalStore({ persistence: repo });

    store.start('ws-chat:t1', '写周报');
    store.markBlocked('ws-chat:t1', ['缺数据']);

    const loaded = repo.load('ws-chat:t1');
    expect(loaded).toBeDefined();
    expect(loaded!.goal).toBe('写周报');
    expect(loaded!.status).toBe('blocked');
    expect(loaded!.reasons).toEqual(['缺数据']);
  });

  it('hydrates incomplete Goals after restart and converts active→blocked', () => {
    const repo = createGoalRepository(db);
    const store1 = new GoalStore({ persistence: repo });
    store1.start('ws-chat:t1', '长任务');
    expect(repo.load('ws-chat:t1')!.status).toBe('active');

    // Simulate server restart hydrate
    const incomplete = repo.loadIncomplete();
    for (const record of incomplete) {
      if (record.status === 'active') {
        record.status = 'blocked';
        record.reasons = record.reasons.length ? record.reasons : ['进程重启，可继续完成'];
        record.updatedAt = Date.now();
        repo.save(record);
      }
    }

    const store2 = new GoalStore({ persistence: repo });
    store2.hydrate(repo.loadIncomplete());
    const g = store2.get('ws-chat:t1');
    expect(g?.status).toBe('blocked');
    expect(g?.goal).toBe('长任务');
    expect(g?.reasons[0]).toContain('进程重启');
  });

  it('clear deletes durable Goal', () => {
    const repo = createGoalRepository(db);
    const store = new GoalStore({ persistence: repo });
    store.start('ws-chat:t1', 'x');
    store.markCancelled('ws-chat:t1');
    store.clear('ws-chat:t1');
    expect(repo.load('ws-chat:t1')).toBeUndefined();
  });

  it('loadIncomplete only returns active/blocked', () => {
    const repo = createGoalRepository(db);
    const store = new GoalStore({ persistence: repo });
    store.start('ws-chat:a', 'A');
    store.start('ws-chat:b', 'B');
    store.markDone('ws-chat:b');
    store.start('ws-chat:c', 'C');
    store.markBlocked('ws-chat:c', ['wait']);

    const incomplete = repo.loadIncomplete().map((g) => g.sessionId).sort();
    expect(incomplete).toEqual(['ws-chat:a', 'ws-chat:c']);
  });
});
