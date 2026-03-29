/**
 * computeNextRunAtMs 单元测试
 */

import { describe, it, expect } from 'vitest';
import { computeNextRunAtMs } from '../../../src/scheduler/cron-utils.js';

describe('computeNextRunAtMs', () => {
  describe('cron mode', () => {
    it('should return a future timestamp for valid cron', () => {
      const result = computeNextRunAtMs({ scheduleKind: 'cron', cron: '0 9 * * *' });
      expect(result).toBeDefined();
      expect(result!).toBeGreaterThan(Date.now());
    });

    it('should return undefined for invalid cron', () => {
      const result = computeNextRunAtMs({ scheduleKind: 'cron', cron: 'invalid' });
      expect(result).toBeUndefined();
    });

    it('should return undefined for missing cron', () => {
      const result = computeNextRunAtMs({ scheduleKind: 'cron' });
      expect(result).toBeUndefined();
    });
  });

  describe('every mode', () => {
    it('should return a future timestamp for valid intervalMs', () => {
      const result = computeNextRunAtMs({ scheduleKind: 'every', intervalMs: 300000 });
      expect(result).toBeDefined();
      expect(result!).toBeGreaterThan(Date.now());
      expect(result!).toBeLessThanOrEqual(Date.now() + 350000);
    });

    it('should return undefined for missing intervalMs', () => {
      const result = computeNextRunAtMs({ scheduleKind: 'every' });
      expect(result).toBeUndefined();
    });

    it('should return undefined for zero intervalMs', () => {
      const result = computeNextRunAtMs({ scheduleKind: 'every', intervalMs: 0 });
      expect(result).toBeUndefined();
    });

    it('should return undefined for negative intervalMs', () => {
      const result = computeNextRunAtMs({ scheduleKind: 'every', intervalMs: -1000 });
      expect(result).toBeUndefined();
    });
  });

  describe('at mode', () => {
    it('should return a future timestamp for future time', () => {
      const futureTime = new Date(Date.now() + 3600000).toISOString();
      const result = computeNextRunAtMs({ scheduleKind: 'at', runAt: futureTime });
      expect(result).toBeDefined();
      expect(result!).toBeGreaterThan(Date.now());
    });

    it('should return undefined for past time', () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString();
      const result = computeNextRunAtMs({ scheduleKind: 'at', runAt: pastTime });
      expect(result).toBeUndefined();
    });

    it('should return undefined for missing runAt', () => {
      const result = computeNextRunAtMs({ scheduleKind: 'at' });
      expect(result).toBeUndefined();
    });
  });
});
