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
    <div className="flex h-screen bg-stone-950 text-stone-100">
      {/* Sidebar */}
      <aside className="w-52 bg-stone-900 border-r border-stone-800 flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-stone-800 flex items-center gap-3">
          <img src="/logo.svg" alt="Hive" className="w-9 h-9" />
          <div>
            <h1 className="text-lg font-bold text-amber-400 tracking-wide">Hive</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${state === "connected" ? "bg-green-500" : state === "reconnecting" ? "bg-amber-500" : "bg-red-500"}`} />
              <span className="text-[11px] text-stone-500 capitalize">{state}</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                page === item.id
                  ? "bg-amber-500/15 text-amber-400 font-medium"
                  : "text-stone-400 hover:bg-stone-800 hover:text-stone-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-stone-800">
          <p className="text-[11px] text-stone-600">v0.1.0</p>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto bg-stone-950">
        {page === "status" && <StatusPage />}
        {page === "config" && <ConfigPage />}
        {page === "logs" && <LogViewer />}
        {page === "plugins" && <PluginPage />}
      </main>
    </div>
  );
}
