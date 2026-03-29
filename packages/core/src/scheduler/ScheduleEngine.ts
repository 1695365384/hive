/**
 * ScheduleEngine
 *
 * 定时任务调度引擎，支持 cron / every / at 三种调度模式。
 * 独立于 Agent 运行，通过回调与 Agent 交互。
 */

import { schedule as cronSchedule, ScheduledTask } from 'node-cron';
import { randomUUID } from 'crypto';
import type {
  Schedule,
  TriggerCallback,
  ScheduleEngineConfig,
  ScheduleEngineStatus,
  IScheduleEngine,
  IScheduleRepository,
} from './types.js';
import { isValidCron, computeNextRunAtMs } from './cron-utils.js';

const DEFAULT_SHUTDOWN_TIMEOUT = 30000;
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 3;

/** 已注册的调度器句柄 */
interface SchedulerHandle {
  stop(): void;
}

/** Cron 调度器句柄 */
class CronHandle implements SchedulerHandle {
  private task: ScheduledTask;
  constructor(task: ScheduledTask) { this.task = task; }
  stop() { this.task.stop(); }
}

/** Interval 调度器句柄 */
class IntervalHandle implements SchedulerHandle {
  private timer: NodeJS.Timeout;
  constructor(timer: NodeJS.Timeout) { this.timer = timer; }
  stop() { clearInterval(this.timer); }
}

/** Timeout 调度器句柄 */
class TimeoutHandle implements SchedulerHandle {
  private timer: NodeJS.Timeout;
  constructor(timer: NodeJS.Timeout) { this.timer = timer; }
  stop() { clearTimeout(this.timer); }
}

/**
 * ScheduleEngine 实现
 */
export class ScheduleEngine implements IScheduleEngine {
  private repository: IScheduleRepository;
  private onTrigger: TriggerCallback;
  private shutdownTimeout: number;
  private circuitBreakerThreshold: number;
  private onCircuitBreak?: (event: import('./types.js').ScheduleCircuitBreakEvent) => void;

  /** 已注册的调度器：scheduleId → Handle */
  private tasks: Map<string, SchedulerHandle> = new Map();

  /** 正在执行的任务：scheduleId → Promise */
  private runningTasks: Map<string, Promise<void>> = new Map();

  /** 引擎是否已启动 */
  private started: boolean = false;

  constructor(repository: IScheduleRepository, onTrigger: TriggerCallback, config?: ScheduleEngineConfig) {
    this.repository = repository;
    this.onTrigger = onTrigger;
    this.shutdownTimeout = config?.shutdownTimeout ?? DEFAULT_SHUTDOWN_TIMEOUT;
    this.circuitBreakerThreshold = config?.circuitBreakerThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD;
    this.onCircuitBreak = config?.onCircuitBreak;
  }

  /**
   * 启动引擎：加载所有 enabled 任务并注册调度器
   */
  async start(): Promise<number> {
    if (this.started) {
      return this.tasks.size;
    }

    const enabledSchedules = await this.repository.findEnabled();

    for (const schedule of enabledSchedules) {
      this.registerTask(schedule);
    }

    this.started = true;
    return this.tasks.size;
  }

  /**
   * 停止引擎：取消所有调度器，等待运行中任务完成
   */
  async stop(): Promise<void> {
    for (const [taskId, handle] of this.tasks) {
      handle.stop();
      this.tasks.delete(taskId);
    }

    if (this.runningTasks.size > 0) {
      const promises = Array.from(this.runningTasks.values());
      const timeoutPromise = new Promise<void>(resolve =>
        setTimeout(resolve, this.shutdownTimeout)
      );
      await Promise.race([Promise.allSettled(promises), timeoutPromise]);
    }

    this.started = false;
  }

  /**
   * 运行时添加新任务
   */
  addTask(schedule: Schedule): void {
    if (this.tasks.has(schedule.id)) {
      this.removeTask(schedule.id);
    }
    this.registerTask(schedule);
  }

  /**
   * 暂停任务
   */
  pauseTask(taskId: string): boolean {
    const handle = this.tasks.get(taskId);
    if (!handle) return false;

    handle.stop();
    this.tasks.delete(taskId);
    return true;
  }

  /**
   * 恢复任务
   */
  async resumeTask(taskId: string): Promise<boolean> {
    const schedule = await this.repository.findById(taskId);
    if (!schedule) return false;

    // 恢复时重置连续失败计数
    if (schedule.consecutiveErrors > 0) {
      await this.repository.update(schedule.id, { consecutiveErrors: 0 });
    }

    this.registerTask(schedule);
    return true;
  }

  /**
   * 删除任务
   */
  removeTask(taskId: string): boolean {
    return this.pauseTask(taskId);
  }

  /**
   * 获取引擎状态
   */
  getStatus(): ScheduleEngineStatus {
    const nextRuns = Array.from(this.tasks.keys()).map(scheduleId => ({
      scheduleId,
      nextRunAt: null,
    }));

    return {
      running: this.started,
      registeredCount: this.tasks.size,
      runningCount: this.runningTasks.size,
      nextRuns,
    };
  }

  /**
   * 根据调度模式注册调度器
   */
  private registerTask(schedule: Schedule): void {
    const execute = () => {
      this.executeSchedule(schedule).catch(() => {
        // 错误已在 executeSchedule 内部处理
      });
    };

    switch (schedule.scheduleKind) {
      case 'every': {
        if (!schedule.intervalMs || schedule.intervalMs <= 0) return;
        const timer = setInterval(execute, schedule.intervalMs);
        this.tasks.set(schedule.id, new IntervalHandle(timer));
        break;
      }
      case 'at': {
        const nextMs = computeNextRunAtMs({
          scheduleKind: 'at',
          runAt: schedule.runAt,
        });
        if (nextMs == null) return; // 已过期，不注册
        const delay = nextMs - Date.now();
        const timer = setTimeout(execute, delay);
        this.tasks.set(schedule.id, new TimeoutHandle(timer));
        break;
      }
      case 'cron':
      default: {
        if (!isValidCron(schedule.cron)) return;
        const task = cronSchedule(schedule.cron, execute);
        task.start();
        this.tasks.set(schedule.id, new CronHandle(task));
        break;
      }
    }
  }

  /**
   * 执行定时任务
   */
  private async executeSchedule(schedule: Schedule): Promise<void> {
    // 防止同一任务并发执行
    if (this.runningTasks.has(schedule.id)) {
      return;
    }

    const runId = randomUUID();
    const startedAt = new Date();

    await this.repository.createRun({
      scheduleId: schedule.id,
      status: 'running',
      startedAt,
    });

    const executePromise = (async () => {
      let success = false;
      let resultSessionId = '';
      let errorMsg: string | undefined;

      try {
        const result = await this.onTrigger({ schedule });
        success = result.success;
        resultSessionId = result.sessionId;
        errorMsg = result.error;
      } catch (error) {
        success = false;
        errorMsg = error instanceof Error ? error.message : String(error);
      }

      if (success) {
        await this.repository.updateRun(runId, {
          status: 'success',
          sessionId: resultSessionId,
          completedAt: new Date(),
        });

        // 重置连续失败计数
        await this.repository.update(schedule.id, { consecutiveErrors: 0 });

        // 一次性任务执行成功后自动删除
        if (schedule.deleteAfterRun) {
          this.pauseTask(schedule.id);
          await this.repository.delete(schedule.id);
        }
      } else {
        // 失败：递增 consecutiveErrors
        const newErrors = (schedule.consecutiveErrors ?? 0) + 1;
        await this.repository.update(schedule.id, { consecutiveErrors: newErrors });

        await this.repository.updateRun(runId, {
          status: 'failed',
          sessionId: resultSessionId || undefined,
          completedAt: new Date(),
          error: errorMsg,
        });

        // 连续失败熔断
        if (newErrors >= this.circuitBreakerThreshold) {
          this.pauseTask(schedule.id);
          await this.repository.update(schedule.id, { enabled: false });

          // 通知外部（bootstrap 通过此回调发 bus 事件）
          this.onCircuitBreak?.({
            scheduleId: schedule.id,
            name: schedule.name,
            consecutiveErrors: newErrors,
          });
        }
      }

      this.runningTasks.delete(schedule.id);
    })();

    this.runningTasks.set(schedule.id, executePromise);
  }
}

/**
 * Create schedule engine instance
 */
export function createScheduleEngine(
  repository: IScheduleRepository,
  onTrigger: TriggerCallback,
  config?: ScheduleEngineConfig,
): ScheduleEngine {
  return new ScheduleEngine(repository, onTrigger, config);
}
