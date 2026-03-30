import { useEffect, useState } from "react";
import { useWsClient } from "../hooks/use-ws-client";

interface AvailablePlugin {
  name: string;
  version: string;
  description?: string;
}

interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
  source: string;
  installedAt: string;
  description?: string;
  config: Record<string, unknown>;
}

export function PluginPage() {
  const { request, onEvent } = useWsClient();
  const [available, setAvailable] = useState<AvailablePlugin[]>([]);
  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);
  const [installing, setInstalling] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [configPlugin, setConfigPlugin] = useState<InstalledPlugin | null>(null);
  const [configJson, setConfigJson] = useState("{}");
  const [configSaving, setConfigSaving] = useState(false);

  const loadAvailable = () => {
    request<AvailablePlugin[]>("plugin.available").then(setAvailable).catch(() => setAvailable([]));
  };

  const loadInstalled = () => {
    request<InstalledPlugin[]>("plugin.list").then(setInstalled).catch(() => setInstalled([]));
  };

  useEffect(() => {
    loadAvailable();
    loadInstalled();

    const unsub1 = onEvent<{ id: string }>("plugin.installed", () => {
      loadInstalled();
      loadAvailable();
    });
    const unsub2 = onEvent<{ id: string }>("plugin.uninstalled", () => {
      loadInstalled();
      loadAvailable();
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  const handleInstall = async (name: string) => {
    setInstalling(name);
    setError("");
    try {
      await request("plugin.install", { source: name });
      loadInstalled();
      loadAvailable();
    } catch (err: any) {
      setError(err.message ?? "Installation failed");
    }
    setInstalling(null);
  };

  const handleUninstall = async (name: string) => {
    setUninstalling(name);
    setError("");
    try {
      await request("plugin.uninstall", { id: name });
      loadInstalled();
      loadAvailable();
    } catch (err: any) {
      setError(err.message ?? "Uninstall failed");
    }
    setUninstalling(null);
  };

  const handleOpenConfig = (plugin: InstalledPlugin) => {
    setConfigPlugin(plugin);
    setConfigJson(JSON.stringify(plugin.config ?? {}, null, 2));
    setError("");
  };

  const handleSaveConfig = async () => {
    if (!configPlugin) return;
    setConfigSaving(true);
    setError("");
    try {
      const config = JSON.parse(configJson);
      await request("plugin.updateConfig", { id: configPlugin.id, config });
      setConfigPlugin(null);
    } catch (err: any) {
      setError(err.message ?? "Save failed");
    }
    setConfigSaving(false);
  };

  const isInstalled = (name: string) => installed.some((p) => p.name === name);

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-semibold">Plugins</h2>

      {/* Available Plugins */}
      <div className="bg-stone-900 rounded-lg p-4 space-y-3 border border-stone-800">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider">
            Available ({available.length})
          </h3>
          <button
            onClick={loadAvailable}
            className="text-xs text-stone-400 hover:text-stone-200 transition-colors"
          >
            Refresh
          </button>
        </div>
        {available.length === 0 ? (
          <p className="text-sm text-stone-500">No plugins found</p>
        ) : (
          <div className="space-y-2">
            {available.map((plugin) => (
              <div
                key={plugin.name}
                className="flex items-center justify-between p-3 bg-stone-800 rounded"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{plugin.name}</p>
                  <p className="text-xs text-stone-500 truncate">
                    v{plugin.version}
                    {plugin.description && ` - ${plugin.description}`}
                  </p>
                </div>
                {isInstalled(plugin.name) ? (
                  <button
                    disabled
                    className="shrink-0 ml-3 px-3 py-1 text-xs bg-stone-700 text-stone-500 rounded cursor-not-allowed"
                  >
                    Installed
                  </button>
                ) : (
                  <button
                    onClick={() => handleInstall(plugin.name)}
                    disabled={installing === plugin.name}
                    className="shrink-0 ml-3 px-3 py-1 text-xs bg-amber-600 hover:bg-amber-700 disabled:bg-stone-700 rounded transition-colors"
                  >
                    {installing === plugin.name ? "Installing..." : "Install"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Installed Plugins */}
      <div className="bg-stone-900 rounded-lg p-4 space-y-3 border border-stone-800">
        <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider">
          Installed ({installed.length})
        </h3>
        {installed.length === 0 ? (
          <p className="text-sm text-stone-500">No plugins installed</p>
        ) : (
          <div className="space-y-2">
            {installed.map((plugin) => (
              <div
                key={plugin.id}
                className="flex items-center justify-between p-3 bg-stone-800 rounded"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{plugin.name}</p>
                  <p className="text-xs text-stone-500">
                    v{plugin.version} · {plugin.source}
                    {plugin.description && ` - ${plugin.description}`}
                  </p>
                </div>
                <div className="shrink-0 flex gap-2 ml-3">
                  <button
                    onClick={() => handleOpenConfig(plugin)}
                    className="px-3 py-1 text-xs text-blue-400 hover:bg-blue-400/10 rounded transition-colors"
                  >
                    Config
                  </button>
                  <button
                    onClick={() => handleUninstall(plugin.id)}
                    disabled={uninstalling === plugin.id}
                    className="px-3 py-1 text-xs text-red-400 hover:bg-red-400/10 disabled:bg-stone-700 rounded transition-colors"
                  >
                    {uninstalling === plugin.id ? "..." : "Remove"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Config Modal */}
      {configPlugin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfigPlugin(null)}>
          <div
            className="bg-stone-900 border border-stone-700 rounded-lg p-6 w-full max-w-lg space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Config: {configPlugin.name}
              </h3>
              <button
                onClick={() => setConfigPlugin(null)}
                className="text-stone-400 hover:text-stone-200 text-xl leading-none"
              >
                x
              </button>
            </div>

            <textarea
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              className="w-full h-64 bg-stone-800 border border-stone-700 rounded p-3 text-sm text-stone-100 font-mono resize-none focus:outline-none focus:border-stone-500"
              placeholder='{"key": "value"}'
            />

            {error && <div className="text-sm text-red-400">{error}</div>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfigPlugin(null)}
                className="px-4 py-2 text-sm text-stone-400 hover:text-stone-200 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={configSaving}
                className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 disabled:bg-stone-700 rounded transition-colors"
              >
                {configSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
