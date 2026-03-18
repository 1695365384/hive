/**
 * 基础服务抽象类
 *
 * 提供服务生命周期的模板方法实现
 */

import type {
  IService,
  IServiceConfig,
  ServiceStatus,
  ServiceContext,
} from '../types.js';

/**
 * 基础服务配置
 */
export interface BaseServiceConfig extends IServiceConfig {
  /** 服务名称 */
  name: string;
  /** 启动超时 (ms) */
  startTimeout?: number;
  /** 停止超时 (ms) */
  stopTimeout?: number;
}

/**
 * 基础服务抽象类
 *
 * 使用模板方法模式，子类只需实现具体的生命周期逻辑
 */
export abstract class BaseService<TConfig extends BaseServiceConfig = BaseServiceConfig>
  implements IService<TConfig>
{
  /** 服务名称 */
  readonly name: string;

  /** 服务状态 */
  protected _status: ServiceStatus = 'created';

  /** 服务配置 */
  protected _config: TConfig;

  /** 服务上下文 */
  protected context: ServiceContext | null = null;

  /** 错误信息 */
  protected _error: Error | null = null;

  constructor(config: TConfig) {
    this.name = config.name;
    this._config = config;
  }

  /**
   * 获取服务状态
   */
  get status(): ServiceStatus {
    return this._status;
  }

  /**
   * 获取服务配置
   */
  get config(): TConfig {
    return this._config;
  }

  /**
   * 获取最后的错误
   */
  get lastError(): Error | null {
    return this._error;
  }

  /**
   * 初始化服务
   */
  async initialize(config: Partial<TConfig>, context?: ServiceContext): Promise<void> {
    if (this._status !== 'created') {
      throw new Error(`Service ${this.name} is already initialized`);
    }

    this._status = 'initializing';
    this._config = { ...this._config, ...config } as TConfig;
    this.context = context || null;

    try {
      await this.onInitialize();
      this._status = 'ready';
    } catch (error) {
      this._status = 'error';
      this._error = error instanceof Error ? error : new Error(String(error));
      throw error;
    }
  }

  /**
   * 启动服务
   */
  async start(): Promise<void> {
    if (this._status === 'running') {
      return;
    }

    if (this._status !== 'ready') {
      throw new Error(`Service ${this.name} is not ready (status: ${this._status})`);
    }

    try {
      await this.onStart();
      this._status = 'running';
      this.log('Started');
    } catch (error) {
      this._status = 'error';
      this._error = error instanceof Error ? error : new Error(String(error));
      this.log('Start failed:', error);
      throw error;
    }
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    if (this._status === 'stopped' || this._status === 'created') {
      return;
    }

    this._status = 'stopping';

    try {
      await this.onStop();
      this._status = 'stopped';
      this.log('Stopped');
    } catch (error) {
      this._status = 'error';
      this._error = error instanceof Error ? error : new Error(String(error));
      this.log('Stop failed:', error);
      throw error;
    }
  }

  /**
   * 销毁服务
   */
  async dispose(): Promise<void> {
    if (this._status === 'running') {
      await this.stop();
    }

    try {
      await this.onDispose();
      this.context = null;
      this.log('Disposed');
    } catch (error) {
      this._error = error instanceof Error ? error : new Error(String(error));
      this.log('Dispose failed:', error);
      throw error;
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    if (this._status !== 'running') {
      return false;
    }

    try {
      return await this.onHealthCheck();
    } catch {
      return false;
    }
  }

  // ============================================
  // 模板方法 - 子类实现
  // ============================================

  /**
   * 初始化逻辑 (子类实现)
   */
  protected async onInitialize(): Promise<void> {
    // 默认空实现
  }

  /**
   * 启动逻辑 (子类实现)
   */
  protected async onStart(): Promise<void> {
    // 默认空实现
  }

  /**
   * 停止逻辑 (子类实现)
   */
  protected async onStop(): Promise<void> {
    // 默认空实现
  }

  /**
   * 销毁逻辑 (子类实现)
   */
  protected async onDispose(): Promise<void> {
    // 默认空实现
  }

  /**
   * 健康检查逻辑 (子类实现)
   */
  protected async onHealthCheck(): Promise<boolean> {
    return this._status === 'running';
  }

  // ============================================
  // 工具方法
  // ============================================

  /**
   * 日志输出
   */
  protected log(...args: unknown[]): void {
    console.log(`[${this.name}]`, ...args);
  }

  /**
   * 获取依赖服务
   */
  protected getService<T extends IService>(name: string): T | undefined {
    return this.context?.getService<T>(name);
  }

  /**
   * 发送事件
   */
  protected emit(event: string, data: unknown): void {
    this.context?.emit(event, data);
  }
}
