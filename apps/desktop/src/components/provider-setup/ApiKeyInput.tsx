/**
 * ApiKeyInput — API Key 输入框 + 「测试连接」按钮
 *
 * 在 SetupWizard Step 2 和 ConfigPage 中复用。
 * 点击「测试连接」会调用 WS provider.testKey，实时验证 key 是否有效。
 */

import { useState } from "react";
import { getWsClient } from "../../lib/ws-client";
import {
  type ConnectionTestResult,
  describeConnectionError,
} from "../../types/provider";

interface ApiKeyInputProps {
  value: string;
  onChange: (value: string) => void;
  /** 当前选中的厂商名（用于 placeholder） */
  providerName: string;
  /** 当前选中的厂商 ID（用于发起测试） */
  providerId: string;
  /** 测试时使用的模型 ID */
  model?: string;
}

type TestState = "idle" | "testing" | "success" | "failed";

export function ApiKeyInput({
  value,
  onChange,
  providerName,
  providerId,
  model,
}: ApiKeyInputProps) {
  const [testState, setTestState] = useState<TestState>("idle");
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  const handleTest = async () => {
    if (!value || !providerId) return;
    setTestState("testing");
    setTestResult(null);
    try {
      const result = await getWsClient().request<ConnectionTestResult>(
        "provider.testKey",
        { providerId, apiKey: value, model: model || undefined },
      );
      setTestResult(result);
      setTestState(result.valid ? "success" : "failed");
    } catch (err) {
      setTestResult({
        valid: false,
        error: err instanceof Error ? err.message : "Request failed",
        errorKind: "unknown",
      });
      setTestState("failed");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-stone-300">API Key</label>
        {testState === "success" && (
          <span className="text-xs text-green-400 flex items-center gap-1">
            ✓ {testResult?.latencyMs ? `${testResult.latencyMs}ms` : "Valid"}
          </span>
        )}
        {testState === "failed" && (
          <span className="text-xs text-red-400">✗ Invalid</span>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setTestState("idle");
            setTestResult(null);
          }}
          placeholder={`Enter your ${providerName} API key`}
          className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-4 py-2.5 text-stone-100 placeholder-stone-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
        />
        <button
          type="button"
          onClick={handleTest}
          disabled={!value || testState === "testing"}
          className="px-4 py-2.5 bg-stone-800 hover:bg-stone-700 disabled:bg-stone-800 disabled:cursor-not-allowed text-stone-200 text-sm font-medium rounded-lg border border-stone-700 transition-colors whitespace-nowrap"
        >
          {testState === "testing" ? (
            <span className="flex items-center gap-1.5">
              <div className="animate-spin h-3 w-3 border-2 border-stone-600 border-t-amber-500 rounded-full" />
              Testing
            </span>
          ) : (
            "Test Connection"
          )}
        </button>
      </div>

      {testState === "failed" && testResult && (
        <p className="text-xs text-red-400">{describeConnectionError(testResult)}</p>
      )}
      {testState === "success" && testResult?.modelUsed && (
        <p className="text-xs text-stone-500">
          Verified with model: {testResult.modelUsed}
        </p>
      )}
    </div>
  );
}
