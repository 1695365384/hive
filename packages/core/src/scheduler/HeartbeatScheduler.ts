/**
 * 心跳调度器
 *
 * 周期性调用 Agent.runHeartbeatOnce() 执行健康巡检。
 *
 * 间隔 >= 1 分钟时使用 node-cron 调度；< 1 分钟时 fallback 到 setInterval。
 */

import type { Agent } from '../agents/index.js';
import type { ILogger } from '../types/logger.js';
import { schedule as cronSchedule } from 'node-cron';
import type { ScheduledTask } from 'node-cron';

export interface HeartbeatSchedulerOptions {
  agent: Agent;
  config: {
    intervalMs: number;
    model?: string;
    prompt?: string;
  };
  logger?: ILogger;
}

export class HeartbeatScheduler {
  private agent: Agent;
  private config: HeartbeatSchedulerOptions['config'];
  private logger: ILogger;
  private task?: ScheduledTask;
  private fallbackTimer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(options: HeartbeatSchedulerOptions) {
    this.agent = options.agent;
    this.config = options.config;
    this.logger = options.logger ?? console as unknown as ILogger;
  }

  start(): void {
    if (this.running) return;

    this.running = true;
    const intervalMs = this.config.intervalMs;

    this.tick().catch((err) => {
      this.logger.error('[heartbeat] Initial tick failed:', err);
    });

    if (intervalMs < 60000) {
      this.fallbackTimer = setInterval(() => {
        this.tick().catch((err) => {
          this.logger.error('[heartbeat] Tick failed:', err);
        });
      }, intervalMs);
      this.logger.info(`[heartbeat] Scheduler started with setInterval (interval: ${intervalMs}ms)`);
    } else {
      const minutes = Math.floor(intervalMs / 60000);
      const cronExpr = `*/${minutes} * * * *`;
      this.task = cronSchedule(cronExpr, () => {
        this.tick().catch((err) => {
          this.logger.error('[heartbeat] Tick failed:', err);
        });
      });
      this.task.start();
      this.logger.info(`[heartbeat] Scheduler started with cron (interval: ${intervalMs}ms, cron: ${cronExpr})`);
    }
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = undefined;
    }
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = undefined;
    }
    this.running = false;
    this.logger.info('[heartbeat] Scheduler stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  async tick(): Promise<void> {
    const startTime = Date.now();

    try {
      const result = await this.agent.runHeartbeatOnce({
        model: this.config.model,
        prompt: this.config.prompt,
      });

      const duration = Date.now() - startTime;

      if (result.hasAlert) {
        this.logger.warn(`[heartbeat] Alert detected (${duration}ms): ${result.content.slice(0, 200)}`);
      } else {
        this.logger.info(`[heartbeat] OK (${duration}ms)`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`[heartbeat] Tick failed (${duration}ms):`, error);
    }
  }
}
