/**
 * Session-only connection verify states for Provider settings hero.
 * Never infer "verified" from a masked/saved API key.
 */
export type ProviderVerifyStatus =
  | "unknown"
  | "testing"
  | "verified"
  | "failed";

export function looksMaskedApiKey(value: string): boolean {
  if (!value) return false;
  return value.includes("*");
}

export function canTestApiKey(opts: {
  value: string;
  apiKeyChanged: boolean;
  providerId: string;
}): boolean {
  if (!opts.providerId || !opts.value.trim()) return false;
  if (!opts.apiKeyChanged) return false;
  if (looksMaskedApiKey(opts.value)) return false;
  return true;
}

export function heroVerifyBadge(
  status: ProviderVerifyStatus,
  isDirty: boolean,
): "unknown" | "testing" | "verified" | "failed" | "unverified" {
  if (status === "testing" || status === "verified" || status === "failed") {
    return status;
  }
  if (isDirty) return "unverified";
  return "unknown";
}
