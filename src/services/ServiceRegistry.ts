/**
 * 服务注册表
 *
 * 管理服务的注册、生命周期和依赖
 */

import type { IService, IServiceConfig, ServiceContext, ServiceStatus } from './types.js';

/**
 * 服务注册项
 */
interface ServiceEntry {
  service: IService;
  initialized: boolean;
}

/**
 * 事件处理器
 */
type EventHandler = (data: unknown) => void;

/**
 * 服务注册表
 *
 * 实现 ServiceContext 接口，提供服务间通信
 */
export class ServiceRegistry implements ServiceContext {
  private services: Map<string, ServiceEntry> = new Map();
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();

  /**
   * 注册服务
   */
  register<T extends IService>(service: T): void {
    if (this.services.has(service.name)) {
      throw new Error(`Service ${service.name} is already registered`);
    }

    this.services.set(service.name, {
      service,
      initialized: false,
    });
  }

  /**
   * 获取服务
   */
  getService<T extends IService>(name: string): T | undefined {
    const entry = this.services.get(name);
    return entry ? (entry.service as T) : undefined;
  }

  /**
   * 发送事件
   */
  emit(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[ServiceRegistry] Event handler error for ${event}:`, error);
        }
      });
    }
  }

  /**
   * 监听事件
   */
  on(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * 取消监听
   */
  off(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * 初始化所有服务
   *
   * 按优先级和依赖顺序初始化
   */
  async initializeAll(): Promise<void> {
    const sortedServices = this.getSortedServices();

    for (const { service } of sortedServices) {
      const entry = this.services.get(service.name);
      if (entry && !entry.initialized) {
        try {
          await service.initialize(service.config as Partial<IServiceConfig>, this);
          entry.initialized = true;
          console.log(`[ServiceRegistry] Initialized: ${service.name}`);
        } catch (error) {
          console.error(`[ServiceRegistry] Failed to initialize ${service.name}:`, error);
          throw error;
        }
      }
    }
  }

  /**
   * 启动所有服务
   *
   * 按优先级和依赖顺序启动
   */
  async startAll(): Promise<void> {
    const sortedServices = this.getSortedServices();

    for (const { service } of sortedServices) {
      if (service.config.autoStart !== false) {
        try {
          await service.start();
        } catch (error) {
          console.error(`[ServiceRegistry] Failed to start ${service.name}:`, error);
          throw error;
        }
      }
    }
  }

  /**
   * 停止所有服务
   *
   * 按相反顺序停止
   */
  async stopAll(): Promise<void> {
    const sortedServices = this.getSortedServices().reverse();

    for (const { service } of sortedServices) {
      if (service.status === 'running') {
        try {
          await service.stop();
        } catch (error) {
          console.error(`[ServiceRegistry] Failed to stop ${service.name}:`, error);
          // 继续停止其他服务
        }
      }
    }
  }

  /**
   * 销毁所有服务
   */
  async disposeAll(): Promise<void> {
    const sortedServices = this.getSortedServices().reverse();

    for (const { service } of sortedServices) {
      try {
        await service.dispose();
      } catch (error) {
        console.error(`[ServiceRegistry] Failed to dispose ${service.name}:`, error);
        // 继续销毁其他服务
      }
    }

    this.services.clear();
    this.eventHandlers.clear();
  }

  /**
   * 健康检查所有服务
   */
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [name, { service }] of this.services) {
      if (service.healthCheck) {
        try {
          results[name] = await service.healthCheck();
        } catch {
          results[name] = false;
        }
      } else {
        results[name] = service.status === 'running';
      }
    }

    return results;
  }

  /**
   * 获取所有服务状态
   */
  getAllStatus(): Record<string, { status: ServiceStatus; config: IServiceConfig }> {
    const status: Record<string, { status: ServiceStatus; config: IServiceConfig }> = {};

    for (const [name, { service }] of this.services) {
      status[name] = {
        status: service.status,
        config: service.config,
      };
    }

    return status;
  }

  /**
   * 获取排序后的服务列表
   *
   * 按优先级和依赖关系排序
   */
  private getSortedServices(): ServiceEntry[] {
    const entries = Array.from(this.services.values());

    // 简单拓扑排序：按优先级和依赖
    const sorted: ServiceEntry[] = [];
    const visited = new Set<string>();

    const visit = (entry: ServiceEntry) => {
      if (visited.has(entry.service.name)) return;
      visited.add(entry.service.name);

      // 先访问依赖
      const deps = entry.service.config.dependencies || [];
      for (const depName of deps) {
        const dep = this.services.get(depName);
        if (dep) {
          visit(dep);
        }
      }

      sorted.push(entry);
    };

    // 按优先级排序后进行拓扑排序
    entries.sort((a, b) => {
      const priorityA = a.service.config.priority ?? 100;
      const priorityB = b.service.config.priority ?? 100;
      return priorityA - priorityB;
    });

    for (const entry of entries) {
      visit(entry);
    }

    return sorted;
  }
}

// 全局服务注册表实例
let globalRegistry: ServiceRegistry | null = null;

/**
 * 获取全局服务注册表
 */
export function getServiceRegistry(): ServiceRegistry {
  if (!globalRegistry) {
    globalRegistry = new ServiceRegistry();
  }
  return globalRegistry;
}

/**
 * 重置全局服务注册表 (测试用)
 */
export function resetServiceRegistry(): void {
  globalRegistry = null;
}
