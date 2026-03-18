/**
 * 服务模块入口
 *
 * 统一导出所有服务和接口
 */

// 类型导出
export type {
  ServiceStatus,
  IServiceConfig,
  ServiceContext,
  IService,
} from './types.js';

// 基础服务
export { BaseService } from './base/BaseService.js';
export type { BaseServiceConfig } from './base/BaseService.js';

// 服务注册表
export { ServiceRegistry, getServiceRegistry, resetServiceRegistry } from './ServiceRegistry.js';
