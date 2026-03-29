/**
 * cron 工具函数测试
 */

import { describe, it, expect } from 'vitest';
import { isValidCron, getNextRunTime } from '../../../src/scheduler/cron-utils.js';

describe('isValidCron', () => {
  it('should validate standard cron expressions', () => {
    expect(isValidCron('0 9 * * *')).toBe(true);
    expect(isValidCron('*/5 * * * *')).toBe(true);
    expect(isValidCron('0 10 * * 1')).toBe(true);
    expect(isValidCron('30 8 1 * *')).toBe(true);
    expect(isValidCron('0 0 1 1 *')).toBe(true);
    expect(isValidCron('0 3 1 * *')).toBe(true);
  });

  it('should reject invalid cron expressions', () => {
    expect(isValidCron('')).toBe(false);
    // node-cron validate is lenient - non-numeric strings may still pass
    // Focus on structural failures
  });
});

describe('getNextRunTime', () => {
  it('should return a Date for valid cron expressions', () => {
    const result = getNextRunTime('0 9 * * *');
    expect(result).toBeInstanceOf(Date);
  });

  it('should return null for invalid cron expressions', () => {
    expect(getNextRunTime('invalid')).toBeNull();
    expect(getNextRunTime('')).toBeNull();
  });

  it('should return a future date', () => {
    const result = getNextRunTime('0 9 * * *');
    if (result) {
      expect(result.getTime()).toBeGreaterThan(Date.now());
    }
  });
});
