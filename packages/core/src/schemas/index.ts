/**
 * JSON Schema 导出
 *
 * 提供 Agent 和 Provider 配置的 JSON Schema
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 加载 JSON Schema 文件
 */
function loadSchema(name: string): object {
  const path = join(__dirname, `${name}.json`);
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

// 预加载 Schemas
let _agentConfigSchema: object | null = null;
let _providerConfigSchema: object | null = null;

/**
 * 获取 Agent 配置 Schema
 */
export function getAgentConfigSchema(): object {
  if (!_agentConfigSchema) {
    _agentConfigSchema = loadSchema('agent-config');
  }
  return _agentConfigSchema;
}

/**
 * 获取 Provider 配置 Schema
 */
export function getProviderConfigSchema(): object {
  if (!_providerConfigSchema) {
    _providerConfigSchema = loadSchema('provider-config');
  }
  return _providerConfigSchema;
}

/**
 * Schema URI 常量
 */
export const SCHEMA_URIS = {
  AGENT_CONFIG: 'https://hive.dev/schemas/agent-config.json',
  PROVIDER_CONFIG: 'https://hive.dev/schemas/provider-config.json',
} as const;

// 导出 Schema 路径（用于外部验证）
export const SCHEMA_PATHS = {
  AGENT_CONFIG: join(__dirname, 'agent-config.json'),
  PROVIDER_CONFIG: join(__dirname, 'provider-config.json'),
} as const;
