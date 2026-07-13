import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { getWsClient } from "../lib/ws-client";
import { ProviderGrid } from "../components/provider-setup/ProviderGrid";
import { ApiKeyInput } from "../components/provider-setup/ApiKeyInput";
import { ModelSelector } from "../components/provider-setup/ModelSelector";
import { type ProviderInfo, type ModelInfo } from "../types/provider";

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { t } = useTranslation();
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

  const steps = [
    t("setup.stepProvider"),
    t("setup.stepApiKey"),
    t("setup.stepModel"),
  ] as const;

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
        throw new Error(i18n.t("setup.providerTimeout"));
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
      const msg = err instanceof Error ? err.message : t("setup.saveFailed");
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
          <img src="/logo.svg" alt={t("app.name")} className="w-20 h-20 mx-auto mb-4 opacity-60" />
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
          <img src="/logo.svg" alt={t("app.name")} className="w-16 h-16 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-amber-400 mb-1">{t("setup.welcome")}</h1>
          <p className="text-stone-400 text-sm">{t("setup.subtitle")}</p>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center mb-8">
          {steps.map((label, i) => (
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
              {i < steps.length - 1 && (
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
                {t("setup.chooseProvider")}
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
                  {t("setup.connectingTo", { name: selected?.name ?? "" })}
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
                {t("setup.apiKeyHint")}
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
                <p className="font-medium text-stone-400 mb-1">{t("setup.summary")}</p>
                <p>{t("setup.providerLabel")} <span className="text-amber-400">{selected?.name}</span></p>
                <p>{t("setup.modelLabel")} <span className="text-amber-400">{model || t("setup.autoRecommended")}</span></p>
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
              ← {t("common.back")}
            </button>
          ) : (
            <div />
          )}

          {step < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {t("common.continue")} →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {submitting ? t("common.saving") : t("setup.getStarted")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
