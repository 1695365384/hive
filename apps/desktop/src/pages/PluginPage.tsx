import { useEffect, useState } from "react";
import { useWsClient } from "../hooks/use-ws-client";

interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  enabled: boolean;
  channels?: string[];
}

export function PluginPage() {
  const { request } = useWsClient();
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [installSource, setInstallSource] = useState("");
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");

  const loadPlugins = () => {
    request<PluginInfo[]>("plugin.list").then(setPlugins).catch(() => {});
  };

  useEffect(() => {
    loadPlugins();
  }, []);

  const handleInstall = async () => {
    if (!installSource.trim()) return;
    setInstalling(true);
    setError("");

    try {
      await request("plugin.install", { source: installSource.trim() });
      setInstallSource("");
      loadPlugins();
    } catch (err: any) {
      setError(err.message ?? "Installation failed");
    }
    setInstalling(false);
  };

  const handleUninstall = async (id: string) => {
    try {
      await request("plugin.uninstall", { id });
      loadPlugins();
    } catch (err: any) {
      setError(err.message ?? "Uninstall failed");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-semibold">Plugins</h2>

      {/* Install */}
      <div className="bg-gray-900 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium text-gray-400 uppercase">Install Plugin</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={installSource}
            onChange={(e) => setInstallSource(e.target.value)}
            placeholder="npm package name, git URL, or local path"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500"
          />
          <button
            onClick={handleInstall}
            disabled={installing || !installSource.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded text-sm transition-colors"
          >
            {installing ? "Installing..." : "Install"}
          </button>
        </div>
        {error && <div className="text-sm text-red-400">{error}</div>}
      </div>

      {/* Installed Plugins */}
      <div className="bg-gray-900 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium text-gray-400 uppercase">
          Installed ({plugins.length})
        </h3>
        {plugins.length === 0 ? (
          <p className="text-sm text-gray-500">No plugins installed</p>
        ) : (
          <div className="space-y-2">
            {plugins.map((plugin) => (
              <div
                key={plugin.id}
                className="flex items-center justify-between p-3 bg-gray-800 rounded"
              >
                <div>
                  <p className="text-sm font-medium">{plugin.name}</p>
                  <p className="text-xs text-gray-500">
                    v{plugin.version} {plugin.description && `- ${plugin.description}`}
                  </p>
                </div>
                <button
                  onClick={() => handleUninstall(plugin.id)}
                  className="px-3 py-1 text-xs text-red-400 hover:bg-red-400/10 rounded transition-colors"
                >
                  Uninstall
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
