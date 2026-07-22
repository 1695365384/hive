import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getWsClient } from "../../lib/ws-client";
import {
  type ConnectionTestResult,
  describeConnectionError,
} from "../../types/provider";
import type { ProviderVerifyStatus } from "./provider-verify-status";

interface ApiKeyInputProps {
  value: string;
  onChange: (value: string) => void;
  providerName: string;
  providerId: string;
  model?: string;
  /** When false, Test is disabled (masked/saved key). */
  canTest?: boolean;
  testDisabledHint?: string;
  /** Bump to reset local test UI (provider change / cancel). */
  resetToken?: number;
  onVerifyChange?: (
    status: ProviderVerifyStatus,
    result: ConnectionTestResult | null,
  ) => void;
}

type TestState = "idle" | "testing" | "success" | "failed";

export function ApiKeyInput({
  value,
  onChange,
  providerName,
  providerId,
  model,
  canTest = true,
  testDisabledHint,
  resetToken = 0,
  onVerifyChange,
}: ApiKeyInputProps) {
  const { t } = useTranslation();
  const [testState, setTestState] = useState<TestState>("idle");
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(
    null,
  );

  useEffect(() => {
    setTestState("idle");
    setTestResult(null);
  }, [resetToken, providerId]);

  const emit = (
    state: TestState,
    result: ConnectionTestResult | null,
  ) => {
    setTestState(state);
    setTestResult(result);
    const status: ProviderVerifyStatus =
      state === "testing"
        ? "testing"
        : state === "success"
          ? "verified"
          : state === "failed"
            ? "failed"
            : "unknown";
    onVerifyChange?.(status, result);
  };

  const handleTest = async () => {
    if (!canTest || !value || !providerId) return;
    emit("testing", null);
    try {
      const result = await getWsClient().request<ConnectionTestResult>(
        "provider.testKey",
        { providerId, apiKey: value, model: model || undefined },
      );
      emit(result.valid ? "success" : "failed", result);
    } catch (err) {
      emit("failed", {
        valid: false,
        error: err instanceof Error ? err.message : t("provider.requestFailed"),
        errorKind: "unknown",
      });
    }
  };

  const testDisabled = !canTest || !value || testState === "testing";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-stone-300">
          {t("provider.apiKey")}
        </label>
        {testState === "success" && (
          <span className="text-xs text-green-400 flex items-center gap-1">
            ✓{" "}
            {testResult?.latencyMs
              ? `${testResult.latencyMs}ms`
              : t("provider.valid")}
          </span>
        )}
        {testState === "failed" && (
          <span className="text-xs text-red-400">✗ {t("provider.invalid")}</span>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            emit("idle", null);
          }}
          placeholder={t("provider.enterApiKey", { name: providerName })}
          className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-4 py-2.5 text-stone-100 placeholder-stone-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
        />
        <button
          type="button"
          onClick={handleTest}
          disabled={testDisabled}
          title={!canTest ? testDisabledHint : undefined}
          className="px-4 py-2.5 bg-stone-800 hover:bg-stone-700 disabled:bg-stone-800 disabled:cursor-not-allowed text-stone-200 text-sm font-medium rounded-lg border border-stone-700 transition-colors whitespace-nowrap"
        >
          {testState === "testing" ? (
            <span className="flex items-center gap-1.5">
              <div className="animate-spin h-3 w-3 border-2 border-stone-600 border-t-amber-500 rounded-full" />
              {t("provider.testing")}
            </span>
          ) : (
            t("provider.testConnection")
          )}
        </button>
      </div>

      {!canTest && testDisabledHint && (
        <p className="text-xs text-stone-500">{testDisabledHint}</p>
      )}

      {testState === "failed" && testResult && (
        <p className="text-xs text-red-400">
          {describeConnectionError(testResult)}
        </p>
      )}
      {testState === "success" && testResult?.modelUsed && (
        <p className="text-xs text-stone-500">
          {t("provider.verifiedModel", { model: testResult.modelUsed })}
        </p>
      )}
    </div>
  );
}
