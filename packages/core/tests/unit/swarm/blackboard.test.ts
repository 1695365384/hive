/**
 * Blackboard 单元测试
 */

import { describe, it, expect, vi } from 'vitest';
import { Blackboard } from '../../../src/agents/swarm/blackboard.js';

describe('Blackboard', () => {
  describe('基本读写', () => {
    it('should set and get values', () => {
      const bb = new Blackboard();
      bb.set('task', 'hello world');
      expect(bb.get('task')).toBe('hello world');
    });

    it('should return undefined for missing keys', () => {
      const bb = new Blackboard();
      expect(bb.get('missing')).toBeUndefined();
    });

    it('should check has() correctly', () => {
      const bb = new Blackboard();
      expect(bb.has('key')).toBe(false);
      bb.set('key', 'value');
      expect(bb.has('key')).toBe(true);
    });

    it('should handle object values', () => {
      const bb = new Blackboard();
      const obj = { text: 'result', tools: ['Read'] };
      bb.set('node', obj);
      expect(bb.get('node')).toEqual(obj);
    });

    it('should clear all data', () => {
      const bb = new Blackboard();
      bb.set('a', 1);
      bb.set('b', 2);
      bb.clear();
      expect(bb.has('a')).toBe(false);
      expect(bb.has('b')).toBe(false);
      expect(bb.size).toBe(0);
    });
  });

  describe('重复写入检测', () => {
    it('should throw on duplicate key', () => {
      const bb = new Blackboard();
      bb.set('key', 'first');
      expect(() => bb.set('key', 'second')).toThrow(
        'Blackboard key already exists: key'
      );
    });
  });

  describe('render', () => {
    it('should render {task} variable', () => {
      const bb = new Blackboard();
      bb.set('task', 'add auth');
      expect(bb.render('Task: {task}')).toBe('Task: add auth');
    });

    it('should render {nodeId.result} from AgentResult', () => {
      const bb = new Blackboard();
      bb.set('explore', {
        text: 'Found 3 files',
        tools: ['Glob', 'Grep'],
        success: true,
      });
      expect(bb.render('{explore.result}')).toBe('Found 3 files');
    });

    it('should leave unknown variables as-is', () => {
      const bb = new Blackboard();
      expect(bb.render('Hello {unknown}')).toBe('Hello {unknown}');
    });

    it('should render multiple variables', () => {
      const bb = new Blackboard();
      bb.set('task', 'fix bug');
      bb.set('fix', { text: 'Fixed!', success: true });
      expect(bb.render('{task}: {fix.result}')).toBe('fix bug: Fixed!');
    });
  });

  describe('裁剪', () => {
    it('should not truncate short values', () => {
      const bb = new Blackboard({ maxLen: 4000 });
      const short = 'a'.repeat(100);
      bb.set('key', short);
      expect(bb.get('key')).toBe(short);
    });

    it('should truncate long values', () => {
      const bb = new Blackboard({ maxLen: 1000, keepLen: 200 });
      const long = 'x'.repeat(2000);
      bb.set('key', long);
      const result = bb.get('key') as string;
      expect(result.length).toBeLessThan(2000);
      expect(result).toContain('...(omitted');
      expect(result).toContain('x'.repeat(200)); // head
      expect(result).toContain('x'.repeat(200)); // tail
    });

    it('should handle exact maxLen boundary', () => {
      const bb = new Blackboard({ maxLen: 100 });
      const exact = 'a'.repeat(100);
      bb.set('key', exact);
      expect(bb.get('key')).toBe(exact);
    });
  });

  describe('snapshot', () => {
    it('should return entry metadata', () => {
      const bb = new Blackboard({ maxLen: 100 });
      bb.set('task', 'hello');
      const snap = bb.snapshot();
      expect(snap.task).toEqual({
        value: 'hello',
        length: 5,
        truncated: false,
      });
    });

    it('should mark truncated entries', () => {
      const bb = new Blackboard({ maxLen: 10 });
      bb.set('long', 'a'.repeat(100));
      const snap = bb.snapshot();
      expect(snap.long.truncated).toBe(true);
    });
  });

  describe('监听', () => {
    it('should notify key listeners on set', () => {
      const bb = new Blackboard();
      const listener = vi.fn();
      bb.on('key', listener);
      bb.set('key', 'value');
      expect(listener).toHaveBeenCalledWith('value');
    });

    it('should notify global listeners', () => {
      const bb = new Blackboard();
      const listener = vi.fn();
      const unsub = bb.onAny(listener);
      bb.set('a', 1);
      bb.set('b', 2);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenCalledWith('a', 1);
      expect(listener).toHaveBeenCalledWith('b', 2);
      unsub();
    });

    it('should allow unsubscribing', () => {
      const bb = new Blackboard();
      const listener = vi.fn();
      const unsub = bb.on('key', listener);
      bb.set('key', 'first');
      unsub();
      bb.set('key2', 'second'); // should not throw even though 'key' was subscribed
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
