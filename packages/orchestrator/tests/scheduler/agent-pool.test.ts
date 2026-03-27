import { describe, it, expect, beforeEach } from 'vitest';
import { AgentPool } from '../../src/scheduler/AgentPool.js';
import type { AgentLike } from '../../src/scheduler/types.js';

describe('AgentPool', () => {
  let pool: AgentPool;

  beforeEach(() => {
    pool = new AgentPool();
  });

  describe('add', () => {
    it('should add an agent to the pool', () => {
      const agent: AgentLike = { id: 'agent-1' };
      const info = pool.add(agent);

      expect(info.id).toBe('agent-1');
      expect(info.state).toBe('idle');
      expect(info.agent).toBe(agent);
    });

    it('should throw error if agent already registered', () => {
      const agent: AgentLike = { id: 'agent-1' };
      pool.add(agent);

      expect(() => pool.add(agent)).toThrow('Agent already registered');
    });

    it('should use sessionId if id not provided', () => {
      const agent: AgentLike = {
        context: { sessionId: 'session-123' }
      };
      const info = pool.add(agent);

      expect(info.id).toBe('session-123');
    });

    it('should generate id if neither id nor sessionId provided', () => {
      const agent: AgentLike = {};
      const info = pool.add(agent);

      expect(info.id).toMatch(/^agent-/);
    });

    it('should store name and meta', () => {
      const agent: AgentLike = { id: 'agent-1' };
      const info = pool.add(agent, {
        name: 'Test Agent',
        meta: { type: 'worker' }
      });

      expect(info.name).toBe('Test Agent');
      expect(info.meta).toEqual({ type: 'worker' });
    });
  });

  describe('remove', () => {
    it('should remove an agent from the pool', () => {
      const agent: AgentLike = { id: 'agent-1' };
      pool.add(agent);

      expect(pool.remove('agent-1')).toBe(true);
      expect(pool.has('agent-1')).toBe(false);
    });

    it('should return false if agent not found', () => {
      expect(pool.remove('non-existent')).toBe(false);
    });
  });

  describe('get', () => {
    it('should return agent info by id', () => {
      const agent: AgentLike = { id: 'agent-1' };
      pool.add(agent);

      const info = pool.get('agent-1');
      expect(info?.id).toBe('agent-1');
    });

    it('should return undefined if not found', () => {
      expect(pool.get('non-existent')).toBeUndefined();
    });
  });

  describe('getByState', () => {
    it('should return agents by state', () => {
      const agent1: AgentLike = { id: 'agent-1' };
      const agent2: AgentLike = { id: 'agent-2' };
      pool.add(agent1);
      pool.add(agent2);

      pool.updateState('agent-1', 'busy');

      const idleAgents = pool.getByState('idle');
      const busyAgents = pool.getByState('busy');

      expect(idleAgents).toHaveLength(1);
      expect(busyAgents).toHaveLength(1);
    });
  });

  describe('getIdle', () => {
    it('should return only idle agents', () => {
      const agent1: AgentLike = { id: 'agent-1' };
      const agent2: AgentLike = { id: 'agent-2' };
      pool.add(agent1);
      pool.add(agent2);
      pool.updateState('agent-1', 'busy');

      const idle = pool.getIdle();

      expect(idle).toHaveLength(1);
      expect(idle[0].id).toBe('agent-2');
    });
  });

  describe('updateState', () => {
    it('should update agent state', () => {
      const agent: AgentLike = { id: 'agent-1' };
      pool.add(agent);

      pool.updateState('agent-1', 'busy');

      const info = pool.get('agent-1');
      expect(info?.state).toBe('busy');
      expect(info?.lastActivity).toBeDefined();
    });

    it('should store error when state is error', () => {
      const agent: AgentLike = { id: 'agent-1' };
      pool.add(agent);

      const error = new Error('Test error');
      pool.updateState('agent-1', 'error', error);

      const info = pool.get('agent-1');
      expect(info?.state).toBe('error');
      expect(info?.error).toBe(error);
    });
  });

  describe('getStats', () => {
    it('should return pool statistics', () => {
      const agent1: AgentLike = { id: 'agent-1' };
      const agent2: AgentLike = { id: 'agent-2' };
      const agent3: AgentLike = { id: 'agent-3' };
      pool.add(agent1);
      pool.add(agent2);
      pool.add(agent3);

      pool.updateState('agent-1', 'busy');
      pool.updateState('agent-2', 'error');

      const stats = pool.getStats();

      expect(stats).toEqual({
        total: 3,
        idle: 1,
        busy: 1,
        error: 1,
        offline: 0
      });
    });
  });

  describe('size', () => {
    it('should return pool size', () => {
      expect(pool.size).toBe(0);

      pool.add({ id: 'agent-1' });
      expect(pool.size).toBe(1);

      pool.add({ id: 'agent-2' });
      expect(pool.size).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all agents', () => {
      pool.add({ id: 'agent-1' });
      pool.add({ id: 'agent-2' });

      pool.clear();

      expect(pool.size).toBe(0);
    });
  });
});
