import { useState } from "react";
import { useWsClient } from "../hooks/use-ws-client";
import { useLogPolling } from "../hooks/use-log-polling";
import { ConfigPage } from "./ConfigPage";
import { PluginPage } from "./PluginPage";
import { StatusPage } from "./StatusPage";
import { LogDrawer } from "../components/LogDrawer";
import { StatusBar } from "../components/StatusBar";

type Page = "status" | "config" | "plugins";
type DrawerHeight = "collapsed" | "half" | "full";

export function Dashboard() {
  const [page, setPage] = useState<Page>("status");
  const [drawerHeight, setDrawerHeight] = useState<DrawerHeight>("collapsed");
  const { state } = useWsClient();
  useLogPolling();

  const navItems: { id: Page; label: string }[] = [
    { id: "status", label: "Status" },
    { id: "config", label: "Config" },
    { id: "plugins", label: "Plugins" },
  ];

  const toggleDrawer = () => {
    setDrawerHeight((h) => (h === "collapsed" ? "half" : "collapsed"));
  };

  return (
    <div className="flex flex-col h-screen bg-stone-950 text-stone-100">
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-52 bg-stone-900 border-r border-stone-800 flex flex-col">
          <div className="p-4 border-b border-stone-800 flex items-center gap-3">
            <img src="/logo.svg" alt="Hive" className="w-9 h-9" />
            <div>
              <h1 className="text-lg font-bold text-amber-400 tracking-wide">
                Hive
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    state === "connected"
                      ? "bg-green-500"
                      : state === "reconnecting"
                      ? "bg-amber-500"
                      : "bg-red-500"
                  }`}
                />
                <span className="text-[11px] text-stone-500 capitalize">
                  {state}
                </span>
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
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-auto">
            {page === "status" && <StatusPage />}
            {page === "config" && <ConfigPage />}
            {page === "plugins" && <PluginPage />}
          </div>
          <LogDrawer height={drawerHeight} onHeightChange={setDrawerHeight} />
        </main>
      </div>

      <StatusBar drawerHeight={drawerHeight} onToggle={toggleDrawer} />
    </div>
  );
}
