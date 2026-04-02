/**
 * TaskManager — Worker 生命周期管理
 *
 * 追踪活跃的 Worker 任务，支持注册、中止和查询。
 * 被 CoordinatorCapability 和 AgentTool 共享使用。
 */

// ============================================
// 类型
// ============================================

/** Worker 任务类型 */
export type WorkerType = 'explore' | 'plan' | 'general';

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
    });
    return abortController;
  }

  /**
   * 注销 Worker（正常完成时调用）
   */
  unregister(id: string): void {
    this.tasks.delete(id);
  }

  /**
   * 中止指定 Worker
   *
   * @returns 是否成功中止（false = 不存在或已完成）
   */
  abort(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    task.abortController.abort();
    this.tasks.delete(id);
    return true;
  }

  /**
   * 获取指定 Worker 的 AbortController
   */
  getAbortController(id: string): AbortController | undefined {
    return this.tasks.get(id)?.abortController;
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
      task.abortController.abort();
    }
    this.tasks.clear();
  }

  /**
   * 检查指定 Worker 是否活跃
   */
  isActive(id: string): boolean {
    return this.tasks.has(id);
  }
}
