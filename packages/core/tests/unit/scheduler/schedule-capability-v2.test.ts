/**
 * ScheduleCapability 关键词预过滤 + JSON Schema 校验 测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createScheduleCapability } from '../../../src/agents/capabilities/ScheduleCapability.js';

// 创建一个 mock context
function createMockContext() {
  return {
    getCapability: () => null,
    getSkill: () => undefined,
    matchSkill: () => null,
    active: null,
    getAgentConfig: () => undefined,
    providerManager: {},
    runner: {},
    skillRegistry: {},
    agentRegistry: {},
    hookRegistry: {},
    timeoutCap: { dispose: () => {} },
    capabilityRegistry: {
      get: () => null,
      register: () => {},
      has: () => false,
    },
  } as any;
}

describe('ScheduleCapability', () => {
  describe('关键词预过滤', () => {
    let cap: ReturnType<typeof createScheduleCapability>;

    beforeEach(() => {
      cap = createScheduleCapability();
      cap.initialize(createMockContext());
    });

    it('should match schedule-related keywords', () => {
      expect(cap.matchesScheduleKeyword('每天早上9点检查日志')).toBe(true);
      expect(cap.matchesScheduleKeyword('每周一发送报告')).toBe(true);
      expect(cap.matchesScheduleKeyword('每隔5分钟检查')).toBe(true);
      expect(cap.matchesScheduleKeyword('定期监控')).toBe(true);
      expect(cap.matchesScheduleKeyword('提醒我开会')).toBe(true);
      expect(cap.matchesScheduleKeyword('推送结果')).toBe(true);
      expect(cap.matchesScheduleKeyword('设置一个cron任务')).toBe(true);
      expect(cap.matchesScheduleKeyword('定时备份数据')).toBe(true);
    });

    it('should not match non-schedule messages', () => {
      expect(cap.matchesScheduleKeyword('你好')).toBe(false);
      expect(cap.matchesScheduleKeyword('帮我写一段代码')).toBe(false);
      expect(cap.matchesScheduleKeyword('今天的天气怎么样')).toBe(false);
      expect(cap.matchesScheduleKeyword('总结这篇文章')).toBe(false);
    });
  });
});
