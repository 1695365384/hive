import { useState, useEffect } from "react";
import { getWsClient } from "../lib/ws-client";

interface SetupWizardProps {
  onComplete: () => void;
}

interface ProviderPreset {
  id: string;
  name: string;
  type: string;
  defaultModel?: string;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getWsClient()
      .request<ProviderPreset[]>("config.getProviderPresets")
      .then((data) => {
        setPresets(data ?? []);
        if (data && data.length > 0) {
          setSelectedProvider(data[0].id);
          setModel(data[0].defaultModel ?? "");
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider || !apiKey) return;

    setSubmitting(true);
    setError("");

    try {
      await getWsClient().request("config.update", {
        provider: { id: selectedProvider, apiKey, model: model || undefined },
      });

      await getWsClient().request("server.restart");
      // 等待重连和状态检查
      setTimeout(() => {
        onComplete();
      }, 3000);
    } catch (err: any) {
      setError(err.message ?? "Failed to save configuration");
      setSubmitting(false);
    }
  };

  const selectedPreset = presets.find((p) => p.id === selectedProvider);

  return (
    <div className="flex items-center justify-center h-screen bg-gray-950">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Welcome to Hive</h1>
          <p className="text-gray-400">Configure your AI provider to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              AI Provider
            </label>
            <select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value);
                const preset = presets.find((p) => p.id === e.target.value);
                setModel(preset?.defaultModel ?? "");
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`Enter your ${selectedPreset?.name ?? ""} API key`}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Model (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Default Model <span className="text-gray-500">(optional)</span>
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={selectedPreset?.defaultModel ?? "auto"}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="text-red-400 text-sm text-center">{error}</div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2.5 transition-colors"
          >
            {submitting ? "Restarting..." : "Get Started"}
          </button>
        </form>
      </div>
    </div>
  );
}
