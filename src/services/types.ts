/**
 * 服务接口定义
 *
 * 定义服务生命周期接口和网关客户端接口
 */

// ============================================
// 服务状态
// ============================================

/**
 * 服务状态
 */
export type ServiceStatus =
  | 'created'
  | 'initializing'
  | 'ready'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'error';

// ============================================
// 服务配置
// ============================================

/**
 * 服务基础配置
 */
export interface IServiceConfig {
  /** 是否自动启动 */
  autoStart?: boolean;
  /** 启动优先级 (越小越先) */
  priority?: number;
  /** 依赖的服务 */
  dependencies?: string[];
}

// ============================================
// 服务上下文
// ============================================

/**
 * 服务上下文
 *
 * 提供服务间通信和共享资源访问
 */
export interface ServiceContext {
  /** 获取指定服务 */
  getService<T extends IService>(name: string): T | undefined;
  /** 发送事件 */
  emit(event: string, data: unknown): void;
  /** 监听事件 */
  on(event: string, handler: (data: unknown) => void): void;
  /** 取消监听 */
  off(event: string, handler: (data: unknown) => void): void;
}

// ============================================
// 服务接口
// ============================================

/**
 * 服务基础接口
 *
 * 所有服务必须实现此接口
 */
export interface IService<TConfig extends IServiceConfig = IServiceConfig> {
  /** 服务名称 */
  readonly name: string;
  /** 服务状态 */
  readonly status: ServiceStatus;
  /** 服务配置 */
  readonly config: TConfig;

  /**
   * 初始化服务
   * @param config 配置选项
   * @param context 服务上下文
   */
  initialize(config: Partial<TConfig>, context?: ServiceContext): Promise<void>;

  /**
   * 启动服务
   */
  start(): Promise<void>;

  /**
   * 停止服务
   */
  stop(): Promise<void>;

  /**
   * 销毁服务
   */
  dispose(): Promise<void>;

  /**
   * 健康检查 (可选)
   */
  healthCheck?(): Promise<boolean>;
}

