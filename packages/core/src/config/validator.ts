/**
 * 配置验证工具
 *
 * 使用 JSON Schema 验证外部配置
 */

import Ajv from 'ajv';
import type { ValidateFunction, ErrorObject } from 'ajv';
import type { ExternalConfig, ProviderConfig, McpServerConfig } from '../providers/types.js';
import { getAgentConfigSchema, getProviderConfigSchema } from '../schemas/index.js';

const ajv = new Ajv({
  allErrors: true,
  useDefaults: true,
  strict: false,
});

// 缓存编译后的验证函数
let _validateAgentConfig: ValidateFunction | null = null;
let _validateProviderConfig: ValidateFunction | null = null;

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    path: string;
    message: string;
  }>;
}

/**
 * 格式化 Ajv 错误
 */
function formatErrors(errors: ErrorObject[]): ValidationResult['errors'] {
  return errors.map(err => ({
    path: err.instancePath || '/',
    message: err.message || 'Unknown error',
  }));
}

/**
 * 验证 Agent 配置
 */
export function validateAgentConfig(config: unknown): ValidationResult {
  if (!_validateAgentConfig) {
    _validateAgentConfig = ajv.compile(getAgentConfigSchema());
  }

  const valid = _validateAgentConfig(config);

  if (valid) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: formatErrors(_validateAgentConfig.errors || []),
  };
}

/**
 * 验证 Provider 配置
 */
export function validateProviderConfig(config: unknown): ValidationResult {
  if (!_validateProviderConfig) {
    _validateProviderConfig = ajv.compile(getProviderConfigSchema());
  }

  const valid = _validateProviderConfig(config);

  if (valid) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: formatErrors(_validateProviderConfig.errors || []),
  };
}

/**
 * 验证并返回配置，或抛出错误
 */
export function validateOrThrow<T = ExternalConfig>(config: unknown, validator: (c: unknown) => ValidationResult): T {
  const result = validator(config);

  if (!result.valid) {
    const errorMessages = result.errors
      .map(e => `${e.path}: ${e.message}`)
      .join('\n');

    throw new Error(`Configuration validation failed:\n${errorMessages}`);
  }

  return config as T;
}
