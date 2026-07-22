import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { getWsClient } from "../lib/ws-client";
import { useServerStore } from "../stores/server-store";
import { ProviderGrid } from "../components/provider-setup/ProviderGrid";
import { ProviderHero } from "../components/provider-setup/ProviderHero";
import { ApiKeyInput } from "../components/provider-setup/ApiKeyInput";
import { ModelSelector } from "../components/provider-setup/ModelSelector";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import {
  canTestApiKey,
  type ProviderVerifyStatus,
} from "../components/provider-setup/provider-verify-status";
import {
  type ProviderInfo,
  type ModelInfo,
  type ConnectionTestResult,
} from "../types/provider";

interface ServerConfig {
  server: { port: number; host: string; logLevel: string };
  auth: { enabled: boolean; apiKey: string };
  provider: { id: string; apiKey: string; model?: string };
  heartbeat: { enabled: boolean; intervalMs: number; model?: string };
}

interface ConfigUpdateRequest {
  provider?: {
    id?: string;
    apiKey?: string;
    model?: string;
  };
}

export function ConfigPage() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const restarting = useServerStore((s) => s.restarting);
  const startRestart = useServerStore((s) => s.startRestart);

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [draftProvider, setDraftProvider] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [draftModel, setDraftModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const [savedMaskedApiKey, setSavedMaskedApiKey] = useState("");
  const [verifyStatus, setVerifyStatus] =
    useState<ProviderVerifyStatus>("unknown");
  const [verifyLatencyMs, setVerifyLatencyMs] = useState<number | undefined>();
  const [verifyResetToken, setVerifyResetToken] = useState(0);
  const [saveFlash, setSaveFlash] = useState(false);

  const applyDraftToLocalConfig = (apiKeyChanged: boolean) => {
    setConfig((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        provider: {
          id: draftProvider,
          apiKey: apiKeyChanged ? draftApiKey : current.provider.apiKey,
          model: draftModel || undefined,
        },
      };
    });
  };

  const providerChanged = draftProvider !== config?.provider.id;
  const apiKeyChanged = draftApiKey !== savedMaskedApiKey;
  const requiresApiKey =
    providerChanged || savedMaskedApiKey.length === 0 || apiKeyChanged;
  const canTest = canTestApiKey({
    value: draftApiKey,
    apiKeyChanged,
    providerId: draftProvider,
  });

  useEffect(() => {
    getWsClient()
      .request<ServerConfig>("config.get")
      .then((data) => {
        if (data) {
          setConfig(data);
          setDraftProvider(data.provider.id);
          setDraftApiKey(data.provider.apiKey);
          setSavedMaskedApiKey(data.provider.apiKey);
          setDraftModel(data.provider.model ?? "");
        }
      })
      .catch(() => {});

    getWsClient()
      .request<ProviderInfo[]>("provider.list")
      .then((data) => setProviders(data ?? []))
      .catch(() => {});
  }, []);

  const savedProviderId = config?.provider.id;
  useEffect(() => {
    if (!draftProvider) return;
    setLoadingModels(true);
    getWsClient()
      .request<ModelInfo[]>("provider.getModels", { providerId: draftProvider })
      .then((data) => {
        setModels(data ?? []);
        if (savedProviderId && draftProvider !== savedProviderId) {
          const provider = providers.find((p) => p.id === draftProvider);
          setDraftModel(provider?.defaultModel ?? "");
        }
      })
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));
  }, [draftProvider, savedProviderId, providers]);

  const resetVerifySession = () => {
    setVerifyStatus("unknown");
    setVerifyLatencyMs(undefined);
    setVerifyResetToken((n) => n + 1);
  };

  const handleSelectProvider = (id: string) => {
    setDraftProvider(id);
    resetVerifySession();
  };

  const handleSave = async () => {
    if (!draftProvider || (requiresApiKey && !draftApiKey)) return;

    setSaving(true);
    setError("");

    try {
      const providerUpdate: NonNullable<ConfigUpdateRequest["provider"]> = {
        id: draftProvider,
        model: draftModel || undefined,
      };

      if (providerChanged || apiKeyChanged) {
        providerUpdate.apiKey = draftApiKey;
      }

      await getWsClient().request("config.update", {
        provider: providerUpdate,
      } satisfies ConfigUpdateRequest);
      applyDraftToLocalConfig(providerChanged || apiKeyChanged);
      setSavedMaskedApiKey(
        providerChanged || apiKeyChanged ? draftApiKey : savedMaskedApiKey,
      );
      setSaveFlash(true);
      window.setTimeout(() => setSaveFlash(false), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("setup.saveFailed");
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!config) return;
    setDraftProvider(config.provider.id);
    setDraftApiKey(config.provider.apiKey);
    setSavedMaskedApiKey(config.provider.apiKey);
    setDraftModel(config.provider.model ?? "");
    setError("");
    resetVerifySession();
  };

  const isDirty =
    providerChanged ||
    apiKeyChanged ||
    draftModel !== (config?.provider.model ?? "");

  const selected = providers.find((p) => p.id === draftProvider);
  const showUnverifiedNudge =
    (providerChanged || apiKeyChanged) &&
    verifyStatus !== "verified" &&
    verifyStatus !== "testing";

  if (!config) {
    return <div className="p-6 text-stone-400">{t("common.loading")}</div>;
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-6 space-y-5 pb-24">
        <LanguageSwitcher />

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{t("config.title")}</h2>
          <button
            type="button"
            onClick={() => {
              startRestart().catch((err) => {
                console.error("[restart_server] failed:", err);
                setError(
                  err instanceof Error
                    ? err.message
                    : t("config.restartFailed"),
                );
              });
            }}
            disabled={restarting}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-700 disabled:bg-stone-800 disabled:cursor-not-allowed rounded text-sm transition-colors border border-stone-700"
          >
            {restarting ? t("config.restarting") : t("config.restartServer")}
          </button>
        </div>

        {saveFlash && (
          <div className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
            {t("config.saved")}
          </div>
        )}

        <div className="bg-stone-900 rounded-lg p-4 space-y-4 border border-stone-800">
          <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider">
            {t("settings.provider")}
          </h3>

          <ProviderHero
            provider={selected}
            providerId={draftProvider}
            model={draftModel}
            isDirty={isDirty}
            verifyStatus={verifyStatus}
            latencyMs={verifyLatencyMs}
          />

          <div>
            <label className="block text-sm text-stone-400 mb-2">
              {t("config.aiProvider")}
            </label>
            <ProviderGrid
              providers={providers}
              selectedId={draftProvider}
              onSelect={handleSelectProvider}
              columns={4}
              showSearch
              density="compact"
            />
          </div>

          <ApiKeyInput
            value={draftApiKey}
            onChange={setDraftApiKey}
            providerName={selected?.name ?? ""}
            providerId={draftProvider}
            model={draftModel || selected?.defaultModel}
            canTest={canTest}
            testDisabledHint={t("provider.testNeedsNewKey")}
            resetToken={verifyResetToken}
            onVerifyChange={(
              status: ProviderVerifyStatus,
              result: ConnectionTestResult | null,
            ) => {
              setVerifyStatus(status);
              setVerifyLatencyMs(
                result?.valid && result.latencyMs != null
                  ? result.latencyMs
                  : undefined,
              );
            }}
          />

          <ModelSelector
            models={models}
            value={draftModel}
            onChange={setDraftModel}
            loading={loadingModels}
          />

          {error && <div className="text-red-400 text-sm">{error}</div>}
        </div>

        <details className="bg-stone-900 rounded-lg border border-stone-800 group">
          <summary className="cursor-pointer list-none flex items-center justify-between px-4 py-3 text-sm font-medium text-stone-500 uppercase tracking-wider select-none [&::-webkit-details-marker]:hidden">
            <span>{t("config.runtime")}</span>
            <ChevronDown className="w-4 h-4 text-stone-500 transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-4 space-y-4 border-t border-stone-800 pt-3">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-stone-400 mb-1">
                  {t("config.port")}
                </label>
                <span className="text-sm">{config.server.port}</span>
              </div>
              <div>
                <label className="block text-sm text-stone-400 mb-1">
                  {t("config.host")}
                </label>
                <span className="text-sm">{config.server.host}</span>
              </div>
              <div>
                <label className="block text-sm text-stone-400 mb-1">
                  {t("config.logLevel")}
                </label>
                <span className="text-sm">{config.server.logLevel}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-stone-500">{t("config.heartbeat")}</span>
                <span
                  className={`ml-2 ${config.heartbeat.enabled ? "text-green-400" : "text-stone-500"}`}
                >
                  {config.heartbeat.enabled ? t("common.yes") : t("common.no")}
                </span>
              </div>
              <div>
                <span className="text-stone-500">{t("config.interval")}</span>
                <span className="ml-2">
                  {config.heartbeat.intervalMs / 1000}s
                </span>
              </div>
            </div>
          </div>
        </details>
      </div>

      {isDirty && (
        <div className="sticky bottom-0 border-t border-stone-800 bg-stone-950/95 backdrop-blur-sm px-6 py-3 flex flex-col gap-2 shrink-0">
          {showUnverifiedNudge && (
            <p className="text-xs text-stone-500">
              {t("config.unverifiedNudge")}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={
                saving || !draftProvider || (requiresApiKey && !draftApiKey)
              }
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
            >
              {saving ? t("common.saving") : t("config.saveChanges")}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-sm rounded transition-colors"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
