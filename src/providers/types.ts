/**
 * Provider 类型定义
 *
 * 统一的类型定义，避免循环依赖
 */

export interface CCProvider {
  id: string;
  app_id: string;
  name: string;
  base_url: string;
  api_key: string;
  model?: string;
  is_active: boolean;
  config?: Record<string, unknown>;
}

export interface CCMcpServer {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface ProviderConfig {
  name: string;
  base_url: string;
  api_key?: string;
  model?: string;
  models?: string[];
  description?: string;
  note?: string;
  enabled?: boolean;
}

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface AgentDefaults {
  model?: string;
  max_turns?: number;
  thoroughness?: 'quick' | 'medium' | 'very-thorough';
}

export interface ProvidersConfig {
  version: string;
  description?: string;
  default?: string;
  providers: Record<string, ProviderConfig>;
  mcp_servers?: Record<string, McpServerConfig>;
  agent_defaults?: {
    explore?: AgentDefaults;
    plan?: AgentDefaults;
    general?: AgentDefaults;
  };
}
