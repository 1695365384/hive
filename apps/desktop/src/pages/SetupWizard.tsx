import { useState, useEffect } from "react";
import { getWsClient } from "../lib/ws-client";
import { ProviderGrid } from "../components/provider-setup/ProviderGrid";
import { ApiKeyInput } from "../components/provider-setup/ApiKeyInput";
import { ModelSelector } from "../components/provider-setup/ModelSelector";
import { type ProviderInfo, type ModelInfo } from "../types/provider";

interface SetupWizardProps {
  onComplete: () => void;
}

const STEPS = ["Choose Provider", "API Key", "Select Model"] as const;

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(0);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);

  // Step 0: 加载厂商列表
  useEffect(() => {
    getWsClient()
      .request<ProviderInfo[]>("provider.list")
      .then((data) => {
        setProviders(data ?? []);
        if (data && data.length > 0) setSelectedProvider(data[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 切换厂商时预加载模型列表（Step 2 用）
  useEffect(() => {
    if (!selectedProvider) return;
    setLoadingModels(true);
    getWsClient()
      .request<ModelInfo[]>("provider.getModels", { providerId: selectedProvider })
      .then((data) => {
        setModels(data ?? []);
        const provider = providers.find((p) => p.id === selectedProvider);
        setModel(provider?.defaultModel ?? "");
      })
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));
  }, [selectedProvider]);

  const selected = providers.find((p) => p.id === selectedProvider);

  const waitForProviderReady = async (): Promise<void> => {
    const client = getWsClient();
    const start = Date.now();
    const timeoutMs = 30_000;

    for (;;) {
      if (client.getState() === "failed") {
        client.reconnect();
      }

      try {
        const status = await client.request<{ agent: { providerReady: boolean } }>("status.get");
        if (status.agent.providerReady) {
          return;
        }
      } catch {
        // Admin WS may still be applying the provider change.
      }

      if (Date.now() - start > timeoutMs) {
        throw new Error("Provider was saved, but the running agent did not become ready in time");
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  };

  const handleSubmit = async () => {
    if (!selectedProvider || !apiKey) return;

    setSubmitting(true);
    setError("");

    try {
      await getWsClient().request("config.update", {
        provider: { id: selectedProvider, apiKey, model: model || undefined },
      });
      await waitForProviderReady();
      onComplete();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save configuration";
      setError(msg);
      setSubmitting(false);
    }
  };

  const canProceed = () => {
    if (step === 0) return !!selectedProvider;
    if (step === 1) return !!apiKey;
    return true;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-stone-900">
        <div className="text-center">
          <img src="/logo.svg" alt="Hive" className="w-20 h-20 mx-auto mb-4 opacity-60" />
          <div className="animate-spin h-8 w-8 border-2 border-stone-700 border-t-amber-500 rounded-full mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen bg-stone-900">
      <div className="w-full max-w-lg p-8">
        {/* Header + Logo */}
        <div className="text-center mb-6">
          <img src="/logo.svg" alt="Hive" className="w-16 h-16 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-amber-400 mb-1">Welcome to Hive</h1>
          <p className="text-stone-400 text-sm">Configure your AI provider to get started</p>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center mb-8">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center">
              <div
                className={`flex items-center gap-2 transition-colors ${
                  i === step
                    ? "text-amber-400"
                    : i < step
                    ? "text-green-400"
                    : "text-stone-600"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border transition-colors ${
                    i === step
                      ? "border-amber-500 bg-amber-500/10"
                      : i < step
                      ? "border-green-500 bg-green-500/10"
                      : "border-stone-700"
                  }`}
                >
                  {i < step ? "✓" : i + 1}
                </div>
                <span className="text-xs hidden sm:inline">{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-8 h-px mx-1 ${i < step ? "bg-green-500" : "bg-stone-700"}`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="min-h-[200px]">
          {/* Step 0: Provider Selection */}
          {step === 0 && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-stone-300">
                Choose your AI provider
              </label>
              <ProviderGrid
                providers={providers}
                selectedId={selectedProvider}
                onSelect={setSelectedProvider}
              />
            </div>
          )}

          {/* Step 1: API Key */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-stone-400">
                {selected?.logo && (
                  <div className="w-5 h-5 rounded bg-white/10 p-0.5">
                    <img
                      src={selected.logo}
                      alt=""
                      className="w-full h-full object-contain"
                      style={{ filter: "invert(1) brightness(2)" }}
                    />
                  </div>
                )}
                <span>
                  Connecting to <span className="text-amber-400 font-medium">{selected?.name}</span>
                </span>
              </div>
              <ApiKeyInput
                value={apiKey}
                onChange={setApiKey}
                providerName={selected?.name ?? ""}
                providerId={selectedProvider}
                model={model || selected?.defaultModel}
              />
              <p className="text-xs text-stone-500">
                Get your API key from the provider's dashboard. We verify the connection before saving.
              </p>
            </div>
          )}

          {/* Step 2: Model Selection */}
          {step === 2 && (
            <div className="space-y-4">
              <ModelSelector
                models={models}
                value={model}
                onChange={setModel}
                loading={loadingModels}
              />
              <div className="text-xs text-stone-500 bg-stone-900/50 border border-stone-800 rounded-lg p-3">
                <p className="font-medium text-stone-400 mb-1">Summary</p>
                <p>Provider: <span className="text-amber-400">{selected?.name}</span></p>
                <p>Model: <span className="text-amber-400">{model || "Auto (recommended)"}</span></p>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && <div className="text-red-400 text-sm text-center mt-4">{error}</div>}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              disabled={submitting}
              className="px-5 py-2.5 text-stone-400 hover:text-stone-200 text-sm font-medium transition-colors"
            >
              ← Back
            </button>
          ) : (
            <div />
          )}

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              Continue →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {submitting ? "Saving..." : "Get Started"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
