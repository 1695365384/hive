import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getWsClient } from "../lib/ws-client";

interface ServerConfig {
  server: { port: number; host: string; logLevel: string };
  auth: { enabled: boolean; apiKey: string };
  provider: { id: string; apiKey: string; model?: string };
  heartbeat: { enabled: boolean; intervalMs: number; model?: string };
}

interface ProviderInfo {
  id: string;
  name: string;
  logo?: string;
  type: string;
  defaultModel?: string;
  modelCount: number;
}

interface ModelInfo {
  id: string;
  name?: string;
  family?: string;
  contextWindow: number;
  maxOutputTokens?: number;
}

export function ConfigPage() {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [restarting, setRestarting] = useState(false);

  // Provider editing state
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [draftProvider, setDraftProvider] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [draftModel, setDraftModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    getWsClient()
      .request<ServerConfig>("config.get")
      .then((data) => {
        if (data) {
          setConfig(data);
          setDraftProvider(data.provider.id);
          setDraftApiKey(data.provider.apiKey);
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
        // Only reset model if switching provider
        if (config && draftProvider !== config.provider.id) {
          const provider = providers.find((p) => p.id === draftProvider);
          setDraftModel(provider?.defaultModel ?? "");
        }
      })
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));
  }, [draftProvider]);

  const handleSave = async () => {
    if (!draftProvider || !draftApiKey) return;

    setSaving(true);
    setError("");

    try {
      await getWsClient().request("config.update", {
        provider: { id: draftProvider, apiKey: draftApiKey, model: draftModel || undefined },
      });

      await invoke("restart_server");

      // Update local config to match draft
      if (config) {
        setConfig({
          ...config,
          provider: { id: draftProvider, apiKey: draftApiKey, model: draftModel || undefined },
        });
      }
      setDirty(false);
      setRestarting(true);
      setTimeout(() => setRestarting(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save configuration";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!config) return;
    setDraftProvider(config.provider.id);
    setDraftApiKey(config.provider.apiKey);
    setDraftModel(config.provider.model ?? "");
    setDirty(false);
    setError("");
  };

  const isDirty =
    draftProvider !== config?.provider.id ||
    draftApiKey !== config?.provider.apiKey ||
    draftModel !== (config?.provider.model ?? "");

  const selected = providers.find((p) => p.id === draftProvider);

  if (!config) {
    return <div className="p-6 text-stone-400">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Configuration</h2>
        <button
          onClick={async () => {
            setRestarting(true);
            try {
              await invoke("restart_server");
            } catch {
              // Server is shutting down, this is expected
            }
          }}
          disabled={restarting}
          className="px-4 py-2 bg-stone-800 hover:bg-stone-700 disabled:bg-stone-800 disabled:cursor-not-allowed rounded text-sm transition-colors"
        >
          {restarting ? "Restarting..." : "Restart Server"}
        </button>
      </div>

      {/* Provider */}
      <div className="bg-stone-900 rounded-lg p-4 space-y-4 border border-stone-800">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider">Provider</h3>
          {isDirty && (
            <span className="text-xs text-amber-400">Unsaved changes</span>
          )}
        </div>

        <div className="space-y-4">
          {/* Provider Grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-stone-400">AI Provider</label>
              <div className="flex items-center gap-1.5 text-sm text-stone-300">
                {selected?.logo ? (
                  <div className="w-4 h-4 rounded bg-white/10 p-0.5">
                    <img src={selected.logo} alt="" className="w-full h-full object-contain" style={{ filter: 'invert(1) brightness(2)' }} />
                  </div>
                ) : null}
                <span className="text-amber-400">{selected?.name ?? draftProvider}</span>
                {draftModel && <span className="text-stone-500">/ {draftModel}</span>}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-1">
              {providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setDraftProvider(p.id);
                    setDirty(true);
                  }}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-lg border transition-colors ${
                    draftProvider === p.id
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-stone-700 hover:border-stone-500 bg-stone-900"
                  }`}
                >
                  {p.logo ? (
                    <div className="w-7 h-7 rounded bg-white/10 p-1">
                      <img
                        src={p.logo}
                        alt={p.name}
                        className="w-full h-full object-contain"
                        style={{ filter: 'invert(1) brightness(2)' }}
                        onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none" }}
                      />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded bg-stone-700 flex items-center justify-center text-xs text-stone-400">
                      {p.name.slice(0, 2)}
                    </div>
                  )}
                  <span className="text-xs text-stone-300 truncate w-full text-center">
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm text-stone-400 mb-1">API Key</label>
            <input
              type="password"
              value={draftApiKey}
              onChange={(e) => {
                setDraftApiKey(e.target.value);
                setDirty(true);
              }}
              placeholder={`Enter your ${selected?.name ?? ""} API key`}
              className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 placeholder-stone-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-sm text-stone-400 mb-1">
              Default Model
              {models.length > 0 && (
                <span className="text-stone-600 ml-1">({models.length} available)</span>
              )}
            </label>
            {loadingModels ? (
              <div className="flex items-center gap-2 text-sm text-stone-500 py-2">
                <div className="animate-spin h-4 w-4 border-2 border-stone-600 border-t-amber-500 rounded-full" />
                Loading models...
              </div>
            ) : models.length > 0 ? (
              <select
                value={draftModel}
                onChange={(e) => {
                  setDraftModel(e.target.value);
                  setDirty(true);
                }}
                className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              >
                <option value="">Auto (default)</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ?? m.id}
                    {m.contextWindow > 0 && ` (${Math.round(m.contextWindow / 1000)}k ctx)`}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={draftModel}
                onChange={(e) => {
                  setDraftModel(e.target.value);
                  setDirty(true);
                }}
                placeholder="Model ID (e.g., glm-4-flash)"
                className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-sm text-stone-100 placeholder-stone-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="text-red-400 text-sm">{error}</div>
          )}

          {/* Actions */}
          {isDirty && (
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !draftProvider || !draftApiKey}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-sm rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Server */}
      <div className="bg-stone-900 rounded-lg p-4 space-y-4 border border-stone-800">
        <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider">Server</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-stone-400 mb-1">Port</label>
            <span className="text-sm">{config.server.port}</span>
          </div>
          <div>
            <label className="block text-sm text-stone-400 mb-1">Host</label>
            <span className="text-sm">{config.server.host}</span>
          </div>
          <div>
            <label className="block text-sm text-stone-400 mb-1">Log Level</label>
            <span className="text-sm">{config.server.logLevel}</span>
          </div>
        </div>
      </div>

      {/* Heartbeat */}
      <div className="bg-stone-900 rounded-lg p-4 space-y-4 border border-stone-800">
        <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider">Heartbeat</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-stone-500">Enabled</span>
            <span className={`ml-2 ${config.heartbeat.enabled ? "text-green-400" : "text-stone-500"}`}>
              {config.heartbeat.enabled ? "Yes" : "No"}
            </span>
          </div>
          <div>
            <span className="text-stone-500">Interval</span>
            <span className="ml-2">{config.heartbeat.intervalMs / 1000}s</span>
          </div>
        </div>
      </div>
    </div>
  );
}
