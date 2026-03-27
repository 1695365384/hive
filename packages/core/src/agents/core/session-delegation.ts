/**
 * Agent 会话委托方法
 *
 * 从 Agent.ts 提取，减少主文件体积
 */

import type { Session, Message } from '../../session/index.js';
import { SessionCapability } from '../capabilities/SessionCapability.js';
import type { SessionCapabilityConfig } from '../capabilities/SessionCapability.js';

/**
 * 会话管理委托
 */
export class SessionDelegation {
  constructor(private sessionCap: SessionCapability) {}

  get currentSession(): Session | null {
    return this.sessionCap.getCurrentSession();
  }

  async createSession(config?: { title?: string; providerId?: string; model?: string }): Promise<Session> {
    return this.sessionCap.createSession(config);
  }

  async loadSession(sessionId: string): Promise<Session | null> {
    return this.sessionCap.loadSession(sessionId);
  }

  async resumeLastSession(): Promise<Session | null> {
    return this.sessionCap.resumeLastSession();
  }

  getSessionMessages(): Message[] {
    return this.sessionCap.getMessages();
  }

  getFormattedHistory(): string {
    return this.sessionCap.getFormattedHistory();
  }

  async listSessions() {
    return this.sessionCap.listSessions();
  }

  async deleteCurrentSession(): Promise<boolean> {
    return this.sessionCap.deleteCurrentSession();
  }
}
