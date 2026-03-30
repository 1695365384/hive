import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getWsClient } from "../lib/ws-client";

interface SetupWizardProps {
  onComplete: () => void;
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

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    getWsClient()
      .request<ProviderInfo[]>("provider.list")
      .then((data) => {
        setProviders(data ?? []);
        if (data && data.length > 0) {
          setSelectedProvider(data[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider || !apiKey) return;

    setSubmitting(true);
    setError("");

    try {
      await getWsClient().request("config.update", {
        provider: { id: selectedProvider, apiKey, model: model || undefined },
      });

      await invoke("restart_server");
      setTimeout(() => {
        onComplete();
      }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save configuration";
      setError(msg);
      setSubmitting(false);
    }
  };

  const selected = providers.find((p) => p.id === selectedProvider);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-stone-950">
        <div className="text-center">
          <img src="/logo.svg" alt="Hive" className="w-20 h-20 mx-auto mb-4 opacity-60" />
          <div className="animate-spin h-8 w-8 border-2 border-stone-700 border-t-amber-500 rounded-full mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen bg-stone-950">
      <div className="w-full max-w-lg p-8">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="Hive" className="w-20 h-20 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-amber-400 mb-2">Welcome to Hive</h1>
          <p className="text-stone-400">Configure your AI provider to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Provider Grid */}
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-3">
              AI Provider
            </label>
            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
              {providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProvider(p.id)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors ${
                    selectedProvider === p.id
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-stone-700 hover:border-stone-500 bg-stone-900"
                  }`}
                >
                  {p.logo ? (
                    <div className="w-8 h-8 rounded bg-white/10 p-1">
                      <img
                        src={p.logo}
                        alt={p.name}
                        className="w-full h-full object-contain"
                        style={{ filter: 'invert(1) brightness(2)' }}
                        onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none" }}
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded bg-stone-700 flex items-center justify-center text-xs text-stone-400">
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
            <label className="block text-sm font-medium text-stone-300 mb-2">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`Enter your ${selected?.name ?? ""} API key`}
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2.5 text-stone-100 placeholder-stone-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              required
            />
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">
              Default Model
              {models.length > 0 && (
                <span className="text-stone-500 ml-1">({models.length} available)</span>
              )}
            </label>
            {loadingModels ? (
              <div className="flex items-center gap-2 text-sm text-stone-500 py-2">
                <div className="animate-spin h-4 w-4 border-2 border-stone-600 border-t-amber-500 rounded-full" />
                Loading models...
              </div>
            ) : models.length > 0 ? (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2.5 text-stone-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
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
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Model ID (e.g., glm-4-flash)"
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2.5 text-stone-100 placeholder-stone-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="text-red-400 text-sm text-center">{error}</div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-stone-700 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2.5 transition-colors"
          >
            {submitting ? "Restarting..." : "Get Started"}
          </button>
        </form>
      </div>
    </div>
  );
}
