/**
 * Provider 配置共享类型
 *
 * 在 SetupWizard、ConfigPage、Dashboard 侧边栏之间复用。
 */

/** 厂商信息（来自 WS provider.list） */
export interface ProviderInfo {
  id: string;
  name: string;
  logo?: string;
  type: string;
  defaultModel?: string;
  modelCount: number;
}

/** 模型信息（来自 WS provider.getModels） */
export interface ModelInfo {
  id: string;
  name?: string;
  family?: string;
  contextWindow: number;
  maxOutputTokens?: number;
}

/** API key 验证结果（来自 WS provider.testKey） */
export interface ConnectionTestResult {
  valid: boolean;
  error?: string;
  errorKind?: "auth" | "network" | "model" | "unknown";
  latencyMs?: number;
  modelUsed?: string;
}

/** 错误类型 → 用户可读的中文提示 */
export function describeConnectionError(result: ConnectionTestResult): string {
  if (result.valid) return "";
  switch (result.errorKind) {
    case "auth":
      return "API Key 无效或已过期，请检查后重试";
    case "network":
      return "网络连接失败，请检查网络或厂商服务状态";
    case "model":
      return "模型不可用，请尝试更换模型";
    default:
      return result.error || "连接失败，请稍后重试";
  }
}

/** 格式化 context window 大小 */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`;
  return String(tokens);
}
