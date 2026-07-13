import i18n from "../i18n";

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
  supportsTools?: boolean;
}

/** API key 验证结果（来自 WS provider.testKey） */
export interface ConnectionTestResult {
  valid: boolean;
  error?: string;
  errorKind?: "auth" | "network" | "model" | "unknown";
  latencyMs?: number;
  modelUsed?: string;
}

export function describeConnectionError(result: ConnectionTestResult): string {
  if (result.valid) return "";
  switch (result.errorKind) {
    case "auth":
      return i18n.t("provider.errorInvalidKey");
    case "network":
      return i18n.t("provider.errorNetwork");
    case "model":
      return i18n.t("provider.errorModel");
    default:
      return result.error || i18n.t("provider.errorGeneric");
  }
}

/** 格式化 context window 大小 */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`;
  return String(tokens);
}
