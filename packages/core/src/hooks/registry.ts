/**
 * Hook 注册表
 *
 * 管理所有 hooks 的注册、注销和触发
 */

import {
  type HookType,
  type HookTypeMap,
  type HookResult,
  type HookHandler,
  type HookOptions,
  type HookPriority,
  type RegisteredHook,
  type ToolBeforeHookContext,
  type ToolBeforeHookModifiedContext,
  type HookExecutionLog,
  type ExecutionTrackingOptions,
  HOOK_PRIORITY_VALUES,
} from './types.js';

/**
 * 生成唯一 ID
 */
function generateHookId(): string {
  return `hook_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 默认执行追踪配置
 */
const DEFAULT_TRACKING_OPTIONS: ExecutionTrackingOptions = {
  enabled: false,
  maxLogEntries: 100,
};

/**
 * 默认超时时间（毫秒）
 */
const DEFAULT_HOOK_TIMEOUT = 0; // 0 表示无超时

/**
 * Hook 注册表
 *
 * 支持：
 * - 按优先级排序执行
 * - 串行异步执行
 * - 中止传播 (proceed: false)
 * - 参数修改 (modifiedData)
 * - 一次性 hooks
 * - 超时保护
 * - 执行追踪（调试用）
 */
export class HookRegistry {
  private hooks: Map<HookType, RegisteredHook[]> = new Map();
  private sessionId: string;
  private executionLog: HookExecutionLog[] = [];
  private trackingOptions: ExecutionTrackingOptions;

  constructor(sessionId?: string, trackingOptions?: Partial<ExecutionTrackingOptions>) {
    this.sessionId = sessionId || this.generateSessionId();
    this.trackingOptions = { ...DEFAULT_TRACKING_OPTIONS, ...trackingOptions };
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * 获取会话 ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * 设置会话 ID
   */
  setSessionId(id: string): void {
    this.sessionId = id;
  }

  // ============================================
  // 注册方法
  // ============================================

  /**
   * 注册 hook
   *
   * @param type - Hook 类型
   * @param handler - 处理器函数
   * @param options - 注册选项
   * @returns Hook ID（用于注销）
   */
  on<T extends HookType>(
    type: T,
    handler: HookHandler<HookTypeMap[T]>,
    options?: HookOptions
  ): string {
    const priority = options?.priority ?? 'normal';
    const hook: RegisteredHook<HookTypeMap[T]> = {
      id: generateHookId(),
      type,
      handler: handler as HookHandler<unknown>,
      priority: HOOK_PRIORITY_VALUES[priority],
      once: options?.once ?? false,
      description: options?.description,
      timeout: options?.timeout ?? DEFAULT_HOOK_TIMEOUT,
      registeredAt: new Date(),
    };

    if (!this.hooks.has(type)) {
      this.hooks.set(type, []);
    }

    const hooks = this.hooks.get(type)!;
    hooks.push(hook as RegisteredHook);
    // 按优先级降序排序（高优先级先执行）
    hooks.sort((a, b) => b.priority - a.priority);

    return hook.id;
  }

  /**
   * 注册一次性 hook
   *
   * @param type - Hook 类型
   * @param handler - 处理器函数
   * @param priority - 优先级
   * @returns Hook ID
   */
  once<T extends HookType>(
    type: T,
    handler: HookHandler<HookTypeMap[T]>,
    priority?: HookPriority
  ): string {
    return this.on(type, handler, { priority, once: true });
  }

  /**
   * 注销 hook
   *
   * @param id - Hook ID
   * @returns 是否成功注销
   */
  off(id: string): boolean {
    for (const [type, hooks] of this.hooks) {
      const index = hooks.findIndex((h) => h.id === id);
      if (index !== -1) {
        hooks.splice(index, 1);
        if (hooks.length === 0) {
          this.hooks.delete(type);
        }
        return true;
      }
    }
    return false;
  }

  /**
   * 清除指定类型的所有 hooks
   *
   * @param type - Hook 类型
   */
  clear(type: HookType): void {
    this.hooks.delete(type);
  }

  /**
   * 清除所有 hooks
   */
  clearAll(): void {
    this.hooks.clear();
  }

  // ============================================
  // 触发方法
  // ============================================

  /**
   * 记录执行日志
   */
  private logExecution(log: HookExecutionLog): void {
    if (!this.trackingOptions.enabled) return;

    this.executionLog.push(log);

    // 防止内存泄漏，限制日志条目数
    if (this.executionLog.length > this.trackingOptions.maxLogEntries) {
      this.executionLog.shift();
    }
  }

  /**
   * 执行单个 hook（带超时保护）
   */
  private async executeHookWithTimeout<TContext>(
    hook: RegisteredHook,
    context: TContext
  ): Promise<{ result: unknown; timedOut: boolean; error?: Error }> {
    const timeout = hook.timeout ?? DEFAULT_HOOK_TIMEOUT;

    // 无超时限制
    if (timeout <= 0) {
      try {
        const result = await hook.handler(context);
        return { result, timedOut: false };
      } catch (error) {
        return { result: undefined, timedOut: false, error: error as Error };
      }
    }

    // 带超时保护
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve({ result: undefined, timedOut: true, error: new Error(`Hook ${hook.id} timed out after ${timeout}ms`) });
      }, timeout);

      Promise.resolve(hook.handler(context))
        .then((result) => {
          clearTimeout(timeoutId);
          resolve({ result, timedOut: false });
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          resolve({ result: undefined, timedOut: false, error: error as Error });
        });
    });
  }

  /**
   * 异步触发 hook
   *
   * 串行执行所有 handlers，按优先级排序
   *
   * @param type - Hook 类型
   * @param context - Hook 上下文
   * @returns 是否所有 hooks 都正常执行（proceed: true）
   */
  async emit<T extends HookType>(
    type: T,
    context: HookTypeMap[T]
  ): Promise<boolean> {
    const hooks = this.hooks.get(type);
    if (!hooks || hooks.length === 0) {
      return true;
    }

    const toRemove: string[] = [];

    for (const hook of hooks) {
      const startTime = Date.now();
      let success = false;
      let timedOut = false;
      let error: Error | undefined;
      let stoppedPropagation = false;

      try {
        const executionResult = await this.executeHookWithTimeout(hook, context);
        timedOut = executionResult.timedOut;
        error = executionResult.error;
        const result = executionResult.result;

        if (!timedOut && !error) {
          success = true;
        }

        // 标记一次性 hooks 待删除
        if (hook.once) {
          toRemove.push(hook.id);
        }

        // 如果返回了 HookResult 且 proceed 为 false，中止执行
        if (result && typeof result === 'object' && 'proceed' in result) {
          if (!result.proceed) {
            stoppedPropagation = true;
            // 记录日志
            this.logExecution({
              hookId: hook.id,
              type,
              startTime,
              endTime: Date.now(),
              duration: Date.now() - startTime,
              success,
              timedOut,
              error,
              stoppedPropagation,
            });
            // 移除一次性 hooks
            for (const id of toRemove) {
              this.off(id);
            }
            return false;
          }
        }
      } catch (e) {
        error = e as Error;
        // Hook 执行错误，记录但继续执行
        console.error(`[HookRegistry] Hook ${hook.id} (${type}) error:`, error);
      }

      // 记录日志
      this.logExecution({
        hookId: hook.id,
        type,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        success,
        timedOut,
        error,
        stoppedPropagation,
      });
    }

    // 移除一次性 hooks
    for (const id of toRemove) {
      this.off(id);
    }

    return true;
  }

  /**
   * 同步触发 hook
   *
   * 串行执行所有 handlers，仅适用于同步 handlers
   *
   * @param type - Hook 类型
   * @param context - Hook 上下文
   * @returns 是否所有 hooks 都正常执行
   */
  emitSync<T extends HookType>(type: T, context: HookTypeMap[T]): boolean {
    const hooks = this.hooks.get(type);
    if (!hooks || hooks.length === 0) {
      return true;
    }

    const toRemove: string[] = [];

    for (const hook of hooks) {
      try {
        const result = hook.handler(context);

        // 标记一次性 hooks 待删除
        if (hook.once) {
          toRemove.push(hook.id);
        }

        // 如果返回了 HookResult 且 proceed 为 false，中止执行
        if (result && typeof result === 'object' && 'proceed' in result) {
          if (!result.proceed) {
            // 移除一次性 hooks
            for (const id of toRemove) {
              this.off(id);
            }
            return false;
          }
        }
      } catch (error) {
        // Hook 执行错误，记录但继续执行
        console.error(`[HookRegistry] Hook ${hook.id} (${type}) error:`, error);
      }
    }

    // 移除一次性 hooks
    for (const id of toRemove) {
      this.off(id);
    }

    return true;
  }

  /**
   * 触发 tool:before hook（特殊处理，支持参数修改）
   *
   * @param context - 原始上下文
   * @returns 处理结果，包含是否继续和可能的修改后上下文
   */
  async emitToolBefore(
    context: ToolBeforeHookContext
  ): Promise<{ proceed: boolean; context: ToolBeforeHookContext; error?: Error }> {
    const hooks = this.hooks.get('tool:before');
    if (!hooks || hooks.length === 0) {
      return { proceed: true, context };
    }

    let currentContext: ToolBeforeHookContext = context;
    const toRemove: string[] = [];

    for (const hook of hooks) {
      const startTime = Date.now();
      let success = false;
      let timedOut = false;
      let error: Error | undefined;
      let stoppedPropagation = false;

      try {
        const executionResult = await this.executeHookWithTimeout(hook, currentContext);
        timedOut = executionResult.timedOut;
        error = executionResult.error;
        const result = executionResult.result;

        if (!timedOut && !error) {
          success = true;
        }

        // 标记一次性 hooks 待删除
        if (hook.once) {
          toRemove.push(hook.id);
        }

        // 检查结果
        if (result && typeof result === 'object' && 'proceed' in result) {
          const hookResult = result as HookResult<ToolBeforeHookModifiedContext>;

          if (!hookResult.proceed) {
            stoppedPropagation = true;
            // 记录日志
            this.logExecution({
              hookId: hook.id,
              type: 'tool:before',
              startTime,
              endTime: Date.now(),
              duration: Date.now() - startTime,
              success,
              timedOut,
              error: hookResult.error ?? error,
              stoppedPropagation,
            });
            // 移除一次性 hooks
            for (const id of toRemove) {
              this.off(id);
            }
            return {
              proceed: false,
              context: currentContext,
              error: hookResult.error,
            };
          }

          // 如果有修改后的数据，更新上下文
          if (hookResult.modifiedData) {
            currentContext = {
              ...currentContext,
              ...hookResult.modifiedData,
            };
          }
        }
      } catch (e) {
        error = e as Error;
        // Hook 执行错误，记录但继续执行
        console.error(`[HookRegistry] Hook ${hook.id} (tool:before) error:`, error);
      }

      // 记录日志
      this.logExecution({
        hookId: hook.id,
        type: 'tool:before',
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        success,
        timedOut,
        error,
        stoppedPropagation,
      });
    }

    // 移除一次性 hooks
    for (const id of toRemove) {
      this.off(id);
    }

    return { proceed: true, context: currentContext };
  }

  // ============================================
  // 查询方法
  // ============================================

  /**
   * 获取指定类型的 hooks 数量
   */
  count(type: HookType): number {
    return this.hooks.get(type)?.length ?? 0;
  }

  /**
   * 获取所有 hooks 数量
   */
  totalCount(): number {
    let count = 0;
    for (const hooks of this.hooks.values()) {
      count += hooks.length;
    }
    return count;
  }

  /**
   * 检查是否有指定类型的 hooks
   */
  has(type: HookType): boolean {
    const hooks = this.hooks.get(type);
    return hooks !== undefined && hooks.length > 0;
  }

  /**
   * 获取指定类型的所有 hooks（只读）
   */
  getHooks(type: HookType): ReadonlyArray<RegisteredHook> {
    return this.hooks.get(type) ?? [];
  }

  // ============================================
  // 执行追踪方法
  // ============================================

  /**
   * 获取执行日志
   *
   * @returns 执行日志数组的副本
   */
  getExecutionLog(): HookExecutionLog[] {
    return [...this.executionLog];
  }

  /**
   * 获取最近的执行日志
   *
   * @param count - 获取的条目数
   * @returns 最近的执行日志
   */
  getRecentExecutionLog(count: number): HookExecutionLog[] {
    return this.executionLog.slice(-count);
  }

  /**
   * 清除执行日志
   */
  clearExecutionLog(): void {
    this.executionLog = [];
  }

  /**
   * 获取当前追踪配置
   */
  getTrackingOptions(): ExecutionTrackingOptions {
    return { ...this.trackingOptions };
  }

  /**
   * 设置追踪配置
   */
  setTrackingOptions(options: Partial<ExecutionTrackingOptions>): void {
    this.trackingOptions = { ...this.trackingOptions, ...options };
  }

  /**
   * 启用执行追踪
   */
  enableTracking(maxLogEntries?: number): void {
    this.trackingOptions.enabled = true;
    if (maxLogEntries !== undefined) {
      this.trackingOptions.maxLogEntries = maxLogEntries;
    }
  }

  /**
   * 禁用执行追踪
   */
  disableTracking(): void {
    this.trackingOptions.enabled = false;
  }
}
