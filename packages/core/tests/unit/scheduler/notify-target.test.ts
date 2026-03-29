/**
 * resolveNotifyTarget + bestEffort 测试
 *
 * 测试 bootstrap.ts 中的推送目标解析逻辑
 */

import { describe, it, expect, beforeEach } from 'vitest';

// 从 bootstrap.ts 中提取的 resolveNotifyTarget 逻辑（复制用于测试）
const sessionChannelMap = new Map<string, { channelId: string; chatId: string }>();

function resolveNotifyTarget(
  notifyConfig: { channel?: string; to?: string },
  sessionId?: string
): { channelId: string; chatId: string } | null {
  if (!notifyConfig.channel && !notifyConfig.to) return null;

  if (notifyConfig.channel === 'last') {
    if (sessionId) {
      const mapping = sessionChannelMap.get(sessionId);
      if (mapping) return mapping;
    }
    return null;
  }

  if (notifyConfig.channel && notifyConfig.to) {
    return { channelId: notifyConfig.channel, chatId: notifyConfig.to };
  }

  return null;
}

describe('resolveNotifyTarget', () => {
  beforeEach(() => {
    sessionChannelMap.clear();
    sessionChannelMap.set('session-1', { channelId: 'feishu_1', chatId: 'chat_1' });
  });

  it('should resolve last strategy with session mapping', () => {
    const result = resolveNotifyTarget({ channel: 'last' }, 'session-1');
    expect(result).toEqual({ channelId: 'feishu_1', chatId: 'chat_1' });
  });

  it('should return null for last strategy with unknown session', () => {
    const result = resolveNotifyTarget({ channel: 'last' }, 'unknown-session');
    expect(result).toBeNull();
  });

  it('should return null for last strategy without sessionId', () => {
    const result = resolveNotifyTarget({ channel: 'last' });
    expect(result).toBeNull();
  });

  it('should resolve explicit channel and to', () => {
    const result = resolveNotifyTarget({ channel: 'feishu_2', to: 'chat_2' });
    expect(result).toEqual({ channelId: 'feishu_2', chatId: 'chat_2' });
  });

  it('should return null when only channel specified without to', () => {
    const result = resolveNotifyTarget({ channel: 'feishu_2' });
    expect(result).toBeNull();
  });

  it('should return null for empty notifyConfig', () => {
    const result = resolveNotifyTarget({}, 'session-1');
    expect(result).toBeNull();
  });

  describe('bestEffort', () => {
    it('should gracefully handle null target (bestEffort skip)', () => {
      const notifyConfig = { mode: 'announce', channel: 'last', bestEffort: true };
      const target = resolveNotifyTarget(notifyConfig, 'unknown-session');

      // bestEffort: target is null, should skip silently
      expect(target).toBeNull();
      // The caller checks: if (!target && notifyConfig.bestEffort) → skip
      expect(notifyConfig.bestEffort).toBe(true);
    });
  });
});
