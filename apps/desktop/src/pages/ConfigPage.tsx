import { useEffect, useState } from "react";
import { useWsClient } from "../hooks/use-ws-client";

interface ServerConfig {
  server: { port: number; host: string; logLevel: string };
  auth: { enabled: boolean; apiKey: string };
  provider: { id: string; apiKey: string; model?: string };
  heartbeat: { enabled: boolean; intervalMs: number; model?: string };
}

export function ConfigPage() {
  const { request } = useWsClient();
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    request<ServerConfig>("config.get").then(setConfig).catch(() => {});
  }, []);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await request("server.restart");
    } catch {
      // Server is shutting down, this is expected
    }
  };

  if (!config) {
    return <div className="p-6 text-gray-400">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Configuration</h2>
        <button
          onClick={handleRestart}
          disabled={restarting}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded text-sm transition-colors"
        >
          {restarting ? "Restarting..." : "Restart Server"}
        </button>
      </div>

      {/* Provider */}
      <div className="bg-gray-900 rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase">Provider</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Provider ID</label>
            <input
              type="text"
              value={config.provider.id}
              readOnly
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-300"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">API Key</label>
            <input
              type="password"
              value={config.provider.apiKey}
              readOnly
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-300"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Default Model</label>
            <input
              type="text"
              value={config.provider.model ?? ""}
              readOnly
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-300"
            />
          </div>
        </div>
      </div>

      {/* Server */}
      <div className="bg-gray-900 rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase">Server</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Port</label>
            <span className="text-sm">{config.server.port}</span>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Host</label>
            <span className="text-sm">{config.server.host}</span>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Log Level</label>
            <span className="text-sm">{config.server.logLevel}</span>
          </div>
        </div>
      </div>

      {/* Heartbeat */}
      <div className="bg-gray-900 rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase">Heartbeat</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Enabled</span>
            <span className={`ml-2 ${config.heartbeat.enabled ? "text-green-400" : "text-gray-500"}`}>
              {config.heartbeat.enabled ? "Yes" : "No"}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Interval</span>
            <span className="ml-2">{config.heartbeat.intervalMs / 1000}s</span>
          </div>
        </div>
      </div>
    </div>
  );
}
