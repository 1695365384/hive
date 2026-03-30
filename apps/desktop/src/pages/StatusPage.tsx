import { useEffect, useState } from "react";
import { useWsClient } from "../hooks/use-ws-client";

interface ServerStatus {
  server: { state: string; port: number; uptime: number; version: string };
  agent: { initialized: boolean; providerReady: boolean; currentProvider: string | null; activePlugins: string[] };
  system: { memory: { rss: number; heapUsed: number; heapTotal: number }; nodeVersion: string; platform: string };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function StatusPage() {
  const { request } = useWsClient();
  const [status, setStatus] = useState<ServerStatus | null>(null);

  useEffect(() => {
    loadStatus();
    const timer = setInterval(loadStatus, 5000);
    return () => clearInterval(timer);
  }, []);

  const loadStatus = () => {
    request<ServerStatus>("status.get").then(setStatus).catch(() => {});
  };

  if (!status) {
    return <div className="p-6 text-gray-400">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-semibold">Server Status</h2>

      {/* Server Info */}
      <div className="bg-gray-900 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium text-gray-400 uppercase">Server</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">State</span>
            <span className={`ml-2 ${status.server.state === "running" ? "text-green-400" : "text-yellow-400"}`}>
              {status.server.state}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Port</span>
            <span className="ml-2">{status.server.port}</span>
          </div>
          <div>
            <span className="text-gray-500">Uptime</span>
            <span className="ml-2">{formatUptime(status.server.uptime)}</span>
          </div>
          <div>
            <span className="text-gray-500">Version</span>
            <span className="ml-2">{status.server.version}</span>
          </div>
        </div>
      </div>

      {/* Agent Info */}
      <div className="bg-gray-900 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium text-gray-400 uppercase">Agent</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Initialized</span>
            <span className={`ml-2 ${status.agent.initialized ? "text-green-400" : "text-red-400"}`}>
              {status.agent.initialized ? "Yes" : "No"}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Provider Ready</span>
            <span className={`ml-2 ${status.agent.providerReady ? "text-green-400" : "text-red-400"}`}>
              {status.agent.providerReady ? "Yes" : "No"}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Current Provider</span>
            <span className="ml-2">{status.agent.currentProvider ?? "None"}</span>
          </div>
          <div>
            <span className="text-gray-500">Active Plugins</span>
            <span className="ml-2">{status.agent.activePlugins.length}</span>
          </div>
        </div>
      </div>

      {/* System Info */}
      <div className="bg-gray-900 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium text-gray-400 uppercase">System</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">RSS</span>
            <span className="ml-2">{formatBytes(status.system.memory.rss)}</span>
          </div>
          <div>
            <span className="text-gray-500">Heap Used</span>
            <span className="ml-2">{formatBytes(status.system.memory.heapUsed)}</span>
          </div>
          <div>
            <span className="text-gray-500">Node</span>
            <span className="ml-2">{status.system.nodeVersion}</span>
          </div>
          <div>
            <span className="text-gray-500">Platform</span>
            <span className="ml-2">{status.system.platform}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
