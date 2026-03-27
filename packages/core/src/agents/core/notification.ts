/**
 * Agent 通知和进度委托方法
 *
 * 从 Agent.ts 提取，减少主文件体积
 */

import type {
  TimeoutConfig,
  HeartbeatConfig,
  HeartbeatTaskConfig,
  HeartbeatResult,
} from './types.js';
import type { NotificationType } from '../../hooks/types.js';
import type { AgentContextImpl } from './AgentContext.js';
import { TimeoutCapability } from '../capabilities/TimeoutCapability.js';

/**
 * 超时和心跳委托方法
 */
export class TimeoutDelegation {
  constructor(private context: AgentContextImpl) {}

  get timeoutCap(): TimeoutCapability {
    return this.context.timeoutCap;
  }

  startHeartbeat(config: HeartbeatConfig): void {
    this.context.timeoutCap.startHeartbeat(config);
  }

  stopHeartbeat(): void {
    this.context.timeoutCap.stopHeartbeat();
  }

  updateActivity(): void {
    this.context.timeoutCap.updateActivity();
  }

  isStalled(): boolean {
    return this.context.timeoutCap.isStalled();
  }

  getLastActivity(): number | null {
    return this.context.timeoutCap.getLastActivity();
  }

  getTimeoutConfig(): Required<TimeoutConfig> {
    return this.context.timeoutCap.getConfig();
  }

  updateTimeoutConfig(config: Partial<TimeoutConfig>): void {
    this.context.timeoutCap.updateConfig(config);
  }

  /**
   * 执行一次心跳巡检
   */
  async runHeartbeatOnce(chatFn: (prompt: string, options?: { modelId?: string }) => Promise<string>, config?: HeartbeatTaskConfig): Promise<HeartbeatResult> {
    const defaultPrompt =
      'Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.';
    const prompt = config?.prompt ?? defaultPrompt;

    const reply = await chatFn(prompt, {
      modelId: config?.model,
    });

    const isOk = reply.trim().startsWith('HEARTBEAT_OK');
    const result: HeartbeatResult = {
      isOk,
      hasAlert: !isOk,
      content: isOk ? '' : reply,
    };

    config?.onResult?.(result);
    return result;
  }
}

/**
 * 通知和进度委托方法
 */
export class NotificationDelegation {
  constructor(private context: AgentContextImpl) {}

  async notify(
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const sessionId = this.context.hookRegistry.getSessionId();
    await this.context.hookRegistry.emit('notification:push', {
      sessionId,
      type,
      title,
      message,
      timestamp: new Date(),
      metadata,
    });
  }

  async updateProgress(
    taskId: string,
    progress: number,
    description: string,
    currentStep?: string,
    totalSteps?: number
  ): Promise<void> {
    const sessionId = this.context.hookRegistry.getSessionId();
    await this.context.hookRegistry.emit('task:progress', {
      sessionId,
      taskId,
      progress,
      description,
      currentStep,
      totalSteps,
      timestamp: new Date(),
    });
  }

  async emitThinking(
    thought: string,
    type: 'analyzing' | 'planning' | 'executing' | 'reflecting',
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const sessionId = this.context.hookRegistry.getSessionId();
    await this.context.hookRegistry.emit('agent:thinking', {
      sessionId,
      thought,
      type,
      timestamp: new Date(),
      metadata,
    });
  }
}
