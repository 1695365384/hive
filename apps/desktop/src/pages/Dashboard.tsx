import { useState } from "react";
import { useWsClient } from "../hooks/use-ws-client";
import { LogViewer } from "./LogViewer";
import { ConfigPage } from "./ConfigPage";
import { PluginPage } from "./PluginPage";
import { StatusPage } from "./StatusPage";

type Page = "status" | "config" | "logs" | "plugins";

export function Dashboard() {
  const [page, setPage] = useState<Page>("status");
  const { state } = useWsClient();

  const navItems: { id: Page; label: string }[] = [
    { id: "status", label: "Status" },
    { id: "config", label: "Config" },
    { id: "logs", label: "Logs" },
    { id: "plugins", label: "Plugins" },
  ];

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* Sidebar */}
      <aside className="w-48 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold">Hive</h1>
          <div className="flex items-center gap-1.5 mt-1">
            <div className={`w-2 h-2 rounded-full ${state === "connected" ? "bg-green-500" : state === "reconnecting" ? "bg-yellow-500" : "bg-red-500"}`} />
            <span className="text-xs text-gray-400 capitalize">{state}</span>
          </div>
        </div>

        <nav className="flex-1 p-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                page === item.id
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:bg-gray-800/50 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-800">
          <p className="text-xs text-gray-500">v0.1.0</p>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        {page === "status" && <StatusPage />}
        {page === "config" && <ConfigPage />}
        {page === "logs" && <LogViewer />}
        {page === "plugins" && <PluginPage />}
      </main>
    </div>
  );
}
