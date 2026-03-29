/**
 * Channel 上下文管理
 *
 * 内部类，管理 channelRegistry + sessionChannelMap + resolveNotifyTarget。
 * 不对外暴露，仅在 Server 内部使用。
 */

import type { IChannel } from '../plugins/index.js';

const SESSION_CHANNEL_MAP_MAX_SIZE = 10000;

export class ChannelContext {
  private channels = new Map<string, IChannel>();
  private sessionMap = new Map<string, { channelId: string; chatId: string }>();

  register(channel: IChannel): void {
    this.channels.set(channel.id, channel);
  }

  get(id: string): IChannel | undefined {
    return this.channels.get(id);
  }

  setSession(sessionId: string, channelId: string, chatId: string): void {
    if (this.sessionMap.size >= SESSION_CHANNEL_MAP_MAX_SIZE) {
      const firstKey = this.sessionMap.keys().next().value;
      if (firstKey !== undefined) this.sessionMap.delete(firstKey);
    }
    this.sessionMap.set(sessionId, { channelId, chatId });
  }

  setScheduleSession(scheduleId: string, channelId: string, chatId: string): void {
    this.sessionMap.set(`schedule:${scheduleId}`, { channelId, chatId });
  }

  resolveNotifyTarget(
    notifyConfig: { channel?: string; to?: string },
    contextId?: string,
  ): { channelId: string; chatId: string } | null {
    if (!notifyConfig.channel && !notifyConfig.to) return null;

    if (notifyConfig.channel === 'last') {
      if (contextId) {
        const mapping = this.sessionMap.get(contextId);
        if (mapping) return mapping;
        const scheduleMapping = this.sessionMap.get(`schedule:${contextId}`);
        if (scheduleMapping) return scheduleMapping;
      }
      return null;
    }

    if (notifyConfig.channel && notifyConfig.to) {
      return { channelId: notifyConfig.channel, chatId: notifyConfig.to };
    }

    return null;
  }
}
