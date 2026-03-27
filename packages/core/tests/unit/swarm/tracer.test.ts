/**
 * SwarmTracer 单元测试
 */

import { describe, it, expect } from 'vitest';
import { SwarmTracer } from '../../../src/agents/swarm/tracer.js';

describe('SwarmTracer', () => {
  it('should generate unique swarm IDs', () => {
    const t1 = new SwarmTracer();
    const t2 = new SwarmTracer();
    expect(t1.getSwarmId()).toMatch(/^sw-/);
    expect(t2.getSwarmId()).toMatch(/^sw-/);
    expect(t1.getSwarmId()).not.toBe(t2.getSwarmId());
  });

  it('should accept custom swarm ID', () => {
    const t = new SwarmTracer('my-swarm');
    expect(t.getSwarmId()).toBe('my-swarm');
  });

  describe('record', () => {
    it('should record events with auto timestamp', () => {
      const t = new SwarmTracer();
      t.record({ type: 'swarm.start', metadata: { task: 'test' } });
      const events = t.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('swarm.start');
      expect(events[0].swarmId).toBe(t.getSwarmId());
      expect(events[0].timestamp).toBeGreaterThan(0);
    });

    it('should allow recording with manual timestamp', () => {
      const t = new SwarmTracer();
      t.recordWithTimestamp({
        type: 'node.complete',
        swarmId: 'sw-1',
        timestamp: 1000,
        nodeId: 'explore',
        duration: 200,
      });
      expect(t.getEvents()[0].timestamp).toBe(1000);
    });
  });

  describe('getDuration', () => {
    it('should return 0 for empty events', () => {
      const t = new SwarmTracer();
      expect(t.getDuration()).toBe(0);
    });

    it('should calculate duration from first to last event', () => {
      const t = new SwarmTracer();
      t.recordWithTimestamp({
        type: 'swarm.start',
        swarmId: 'sw-1',
        timestamp: 1000,
      });
      t.recordWithTimestamp({
        type: 'swarm.complete',
        swarmId: 'sw-1',
        timestamp: 5000,
      });
      expect(t.getDuration()).toBe(4000);
    });
  });

  describe('getTokenUsage', () => {
    it('should sum usage from all events', () => {
      const t = new SwarmTracer();
      t.recordWithTimestamp({
        type: 'node.complete',
        swarmId: 'sw-1',
        timestamp: 100,
        usage: { input: 100, output: 50 },
      });
      t.recordWithTimestamp({
        type: 'node.complete',
        swarmId: 'sw-1',
        timestamp: 200,
        usage: { input: 200, output: 100 },
      });
      t.recordWithTimestamp({
        type: 'node.complete',
        swarmId: 'sw-1',
        timestamp: 300,
        // no usage
      });
      const usage = t.getTokenUsage();
      expect(usage).toEqual({ input: 300, output: 150 });
    });
  });

  describe('toJSON', () => {
    it('should return a copy of events', () => {
      const t = new SwarmTracer();
      t.record({ type: 'swarm.start' });
      const json = t.toJSON();
      expect(json).toHaveLength(1);
      expect(json).not.toBe(t.getEvents()); // different reference
    });
  });

  describe('report', () => {
    it('should generate formatted text report', () => {
      const t = new SwarmTracer('sw-42');
      t.recordWithTimestamp({
        type: 'swarm.start',
        swarmId: 'sw-42',
        timestamp: 1000,
        metadata: { task: 'add feature' },
      });
      t.recordWithTimestamp({
        type: 'template.match',
        swarmId: 'sw-42',
        timestamp: 1001,
        metadata: { template: 'add-feature' },
      });
      t.recordWithTimestamp({
        type: 'layer.start',
        swarmId: 'sw-42',
        timestamp: 1100,
        layerIndex: 0,
        metadata: { nodeIds: ['explore', 'plan'] },
      });
      t.recordWithTimestamp({
        type: 'node.complete',
        swarmId: 'sw-42',
        timestamp: 2000,
        layerIndex: 0,
        nodeId: 'explore',
        model: 'claude-haiku-4-5',
        resultLength: 842,
        tools: ['Glob', 'Grep'],
        duration: 900,
      });
      t.recordWithTimestamp({
        type: 'node.complete',
        swarmId: 'sw-42',
        timestamp: 2100,
        layerIndex: 0,
        nodeId: 'plan',
        model: 'claude-haiku-4-5',
        resultLength: 1203,
        tools: ['Read'],
        duration: 1000,
      });
      t.recordWithTimestamp({
        type: 'layer.complete',
        swarmId: 'sw-42',
        timestamp: 2101,
        layerIndex: 0,
      });
      t.recordWithTimestamp({
        type: 'swarm.complete',
        swarmId: 'sw-42',
        timestamp: 2102,
        metadata: { success: true },
      });

      const report = t.report();
      expect(report).toContain('sw-42');
      expect(report).toContain('add feature');
      expect(report).toContain('add-feature');
      expect(report).toContain('✅ explore');
      expect(report).toContain('✅ plan');
      expect(report).toContain('842 chars');
      expect(report).toContain('1203 chars');
      expect(report).toContain('[Glob, Grep]');
      expect(report).toContain('Total:');
    });

    it('should handle empty events gracefully', () => {
      const t = new SwarmTracer();
      const report = t.report();
      expect(report).toContain('═══ Swarm #');
      expect(report).toContain('Total: 0.0s');
    });
  });
});
