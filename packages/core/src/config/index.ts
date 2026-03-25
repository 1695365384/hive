/**
 * 配置模块
 *
 * 提供配置验证和类型
 */

export {
  validateAgentConfig,
  validateProviderConfig,
  validateOrThrow,
  type ValidationResult,
} from './validator.js';

export type {
  ExternalConfig,
  ProviderConfig,
  McpServerConfig,
  AgentDefaults,
} from '../providers/types.js';
