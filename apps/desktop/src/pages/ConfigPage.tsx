import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getWsClient } from "../lib/ws-client";
import { useServerStore } from "../stores/server-store";
import { ProviderGrid } from "../components/provider-setup/ProviderGrid";
import { ApiKeyInput } from "../components/provider-setup/ApiKeyInput";
import { ModelSelector } from "../components/provider-setup/ModelSelector";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { type ProviderInfo, type ModelInfo } from "../types/provider";

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
  const requiresApiKey = providerChanged || savedMaskedApiKey.length === 0 || apiKeyChanged;

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

  useEffect(() => {
    if (!draftProvider) return;
    setLoadingModels(true);
    getWsClient()
      .request<ModelInfo[]>("provider.getModels", { providerId: draftProvider })
      .then((data) => {
        setModels(data ?? []);
        if (config && draftProvider !== config.provider.id) {
          const provider = providers.find((p) => p.id === draftProvider);
          setDraftModel(provider?.defaultModel ?? "");
        }
      })
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));
  }, [draftProvider]);

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
      setSavedMaskedApiKey(providerChanged || apiKeyChanged ? draftApiKey : savedMaskedApiKey);
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
  };

  const isDirty =
    providerChanged ||
    apiKeyChanged ||
    draftModel !== (config?.provider.model ?? "");

  const selected = providers.find((p) => p.id === draftProvider);

  if (!config) {
    return <div className="p-6 text-stone-400">{t("common.loading")}</div>;
  }

  return (
    <div className="h-full p-6 space-y-6 overflow-y-auto">
      <LanguageSwitcher />
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t("config.title")}</h2>
        <button
          onClick={() => {
            startRestart().catch((err) => {
              console.error("[restart_server] failed:", err);
              setError(err instanceof Error ? err.message : t("config.restartFailed"));
            });
          }}
          disabled={restarting}
          className="px-4 py-2 bg-stone-800 hover:bg-stone-700 disabled:bg-stone-800 disabled:cursor-not-allowed rounded text-sm transition-colors"
        >
          {restarting ? t("config.restarting") : t("config.restartServer")}
        </button>
      </div>

      {/* Provider */}
      <div className="bg-stone-900 rounded-lg p-4 space-y-4 border border-stone-800">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider">{t("settings.provider")}</h3>
          {isDirty && <span className="text-xs text-amber-400">{t("config.unsaved")}</span>}
        </div>

        <div className="space-y-4">
          {/* Provider Grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-stone-400">{t("config.aiProvider")}</label>
              <div className="flex items-center gap-1.5 text-sm text-stone-300">
                {selected?.logo ? (
                  <div className="w-4 h-4 rounded bg-white/10 p-0.5">
                    <img
                      src={selected.logo}
                      alt=""
                      className="w-full h-full object-contain"
                      style={{ filter: "invert(1) brightness(2)" }}
                    />
                  </div>
                ) : null}
                <span className="text-amber-400">{selected?.name ?? draftProvider}</span>
                {draftModel && <span className="text-stone-500">/ {draftModel}</span>}
              </div>
            </div>
            <ProviderGrid
              providers={providers}
              selectedId={draftProvider}
              onSelect={setDraftProvider}
              columns={4}
            />
          </div>

          {/* API Key with Test Button */}
          <ApiKeyInput
            value={draftApiKey}
            onChange={setDraftApiKey}
            providerName={selected?.name ?? ""}
            providerId={draftProvider}
            model={draftModel || selected?.defaultModel}
          />

          {/* Model Selection */}
          <ModelSelector
            models={models}
            value={draftModel}
            onChange={setDraftModel}
            loading={loadingModels}
          />

          {/* Error */}
          {error && <div className="text-red-400 text-sm">{error}</div>}

          {/* Actions */}
          {isDirty && (
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !draftProvider || (requiresApiKey && !draftApiKey)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
              >
                {saving ? t("common.saving") : t("config.saveChanges")}
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-sm rounded transition-colors"
              >
                {t("common.cancel")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Server */}
      <div className="bg-stone-900 rounded-lg p-4 space-y-4 border border-stone-800">
        <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider">{t("config.server")}</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-stone-400 mb-1">{t("config.port")}</label>
            <span className="text-sm">{config.server.port}</span>
          </div>
          <div>
            <label className="block text-sm text-stone-400 mb-1">{t("config.host")}</label>
            <span className="text-sm">{config.server.host}</span>
          </div>
          <div>
            <label className="block text-sm text-stone-400 mb-1">{t("config.logLevel")}</label>
            <span className="text-sm">{config.server.logLevel}</span>
          </div>
        </div>
      </div>

      {/* Heartbeat */}
      <div className="bg-stone-900 rounded-lg p-4 space-y-4 border border-stone-800">
        <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider">{t("config.heartbeat")}</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-stone-500">{t("config.enabled")}</span>
            <span className={`ml-2 ${config.heartbeat.enabled ? "text-green-400" : "text-stone-500"}`}>
              {config.heartbeat.enabled ? t("common.yes") : t("common.no")}
            </span>
          </div>
          <div>
            <span className="text-stone-500">{t("config.interval")}</span>
            <span className="ml-2">{config.heartbeat.intervalMs / 1000}s</span>
          </div>
        </div>
      </div>
    </div>
  );
}
