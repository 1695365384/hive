/**
 * TaskManager — Worker 生命周期管理
 *
 * 追踪活跃的 Worker 任务，支持注册、中止和查询。
 * 被 CoordinatorCapability 和 AgentTool 共享使用。
 *
 * Worker 状态机：
 *   PENDING → RUNNING → SUCCESS
 *                    ↘ FAILED
 *                    ↘ CANCELLED
 *                    ↘ TIMEOUT
 */

// ============================================
// 类型
// ============================================

/** Worker 任务类型 */
export type WorkerType = 'explore' | 'plan' | 'general' | 'schedule';

/** Worker 执行状态 */
export type WorkerStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'timeout';

/** 活跃的 Worker 任务 */
export interface WorkerTask {
  /** 唯一标识 */
  id: string;
  /** Worker 类型 */
  type: WorkerType;
  /** 任务描述（可选） */
  description?: string;
  /** 中止控制器 */
  abortController: AbortController;
  /** 启动时间戳 */
  startedAt: number;
  /** 当前执行状态 */
  status: WorkerStatus;
  /** 完成时间戳（终止状态时设置） */
  completedAt?: number;
  /** 终止原因（failed/cancelled/timeout 时设置） */
  failureReason?: string;
}

// ============================================
// TaskManager
// ============================================

/**
 * Worker 任务管理器
 *
 * 管理所有活跃 Worker 的注册、中止和查询。
 */
export class TaskManager {
  private tasks: Map<string, WorkerTask> = new Map();
  private _peakConcurrent = 0;

  /** 等待特定 Worker 完成的 Promise 解析器 */
  private waiters: Map<string, Array<() => void>> = new Map();

  /**
   * 注册新 Worker
   *
   * @returns 该 Worker 的 AbortController，用于中止
   */
  register(id: string, type: WorkerType, description?: string): AbortController {
    const abortController = new AbortController();
    this.tasks.set(id, {
      id,
      type,
      description,
      abortController,
      startedAt: Date.now(),
      status: 'running',
    });
    if (this.tasks.size > this._peakConcurrent) {
      this._peakConcurrent = this.tasks.size;
    }
    return abortController;
  }

  /**
   * 注销 Worker（正常完成时调用）
   */
  unregister(id: string): void {
    const task = this.tasks.get(id);
    if (task && task.status === 'running') {
      this.transitionTo(id, 'success');
    }
    this.tasks.delete(id);
    this.resolveWaiters(id);
  }

  /**
   * 中止指定 Worker
   *
   * 通过 AbortController 取消 LLM 请求。
   *
   * @returns 是否成功中止（false = 不存在或已完成）
   */
  abort(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    this.transitionTo(id, 'cancelled');
    task.abortController.abort();
    this.tasks.delete(id);
    this.resolveWaiters(id);
    return true;
  }

  /**
   * 获取指定 Worker 的 AbortController
   */
  getAbortController(id: string): AbortController | undefined {
    return this.tasks.get(id)?.abortController;
  }

  /**
   * 获取 Worker 当前状态
   *
   * @returns WorkerStatus，若 Worker 不存在返回 undefined
   */
  getWorkerStatus(id: string): WorkerStatus | undefined {
    return this.tasks.get(id)?.status;
  }

  /**
   * 等待指定 Worker 进入终止状态（success/failed/cancelled/timeout）
   *
   * 若 Worker 不存在，立即 resolve。
   * 最大等待时间由调用方通过 AbortSignal 控制。
   */
  waitFor(id: string, signal?: AbortSignal): Promise<void> {
    if (!this.tasks.has(id)) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      if (!this.waiters.has(id)) {
        this.waiters.set(id, []);
      }
      this.waiters.get(id)!.push(resolve);

      // 外部取消信号
      signal?.addEventListener('abort', () => resolve(), { once: true });
    });
  }

  /**
   * 获取所有活跃 Worker
   */
  getActiveTasks(): WorkerTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取活跃 Worker 数量
   */
  get activeCount(): number {
    return this.tasks.size;
  }

  /**
   * 中止所有活跃 Worker
   */
  abortAll(): void {
    for (const task of this.tasks.values()) {
      this.transitionTo(task.id, 'cancelled');
      task.abortController.abort();
      this.resolveWaiters(task.id);
    }
    this.tasks.clear();
  }

  /**
   * 检查指定 Worker 是否活跃
   */
  isActive(id: string): boolean {
    return this.tasks.has(id);
  }

  /**
   * 本次会话中最大并发 Worker 数
   */
  get peakConcurrent(): number {
    return this._peakConcurrent;
  }

  // ============================================
  // 私有工具方法
  // ============================================

  /**
   * 执行状态转换（仅向终止态迁移，不可逆）
   */
  private transitionTo(id: string, newStatus: WorkerStatus): void {
    const task = this.tasks.get(id);
    if (!task) return;
    const terminal: WorkerStatus[] = ['success', 'failed', 'cancelled', 'timeout'];
    if (terminal.includes(task.status)) return; // 已终止，不再转换
    task.status = newStatus;
    if (terminal.includes(newStatus)) {
      task.completedAt = Date.now();
    }
  }

  /**
   * 解除对指定 Worker 的所有等待
   */
  private resolveWaiters(id: string): void {
    const waiters = this.waiters.get(id);
    if (waiters) {
      for (const resolve of waiters) resolve();
      this.waiters.delete(id);
    }
  }
}
