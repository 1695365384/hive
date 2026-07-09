import { useState, useEffect } from "react";
import { getWsClient } from "../lib/ws-client";
import { useWsClient } from "../hooks/use-ws-client";
import { useLogPolling } from "../hooks/use-log-polling";
import { useServerStore } from "../stores/server-store";
import { ConfigPage } from "./ConfigPage";
import { PluginPage } from "./PluginPage";
import { StatusPage } from "./StatusPage";
import { ChatPage } from "./ChatPage";
import { LogDrawer } from "../components/LogDrawer";
import { StatusBar } from "../components/StatusBar";
import { MessageSquare, Activity, Settings, Puzzle } from "lucide-react";
import type { ProviderInfo } from "../types/provider";

type Page = "status" | "config" | "plugins" | "chat";
type DrawerHeight = "collapsed" | "half" | "full";

interface AgentStatus {
  providerReady: boolean;
  currentProvider: string | null;
  currentModel?: string | null;
}

export function Dashboard() {
  const [page, setPage] = useState<Page>("status");
  const [drawerHeight, setDrawerHeight] = useState<DrawerHeight>("collapsed");
  const { state } = useWsClient();
  const restarting = useServerStore((s) => s.restarting);
  useLogPolling();

  // 获取当前 provider 信息（用于侧边栏底部显示）
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);

  useEffect(() => {
    const fetchStatus = () => {
      getWsClient()
        .request<{ agent: AgentStatus }>("status.get")
        .then((data) => setAgentStatus(data.agent))
        .catch(() => {});
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);

    getWsClient()
      .request<ProviderInfo[]>("provider.list")
      .then(setProviders)
      .catch(() => {});

    const unsubscribeConfigChanged = getWsClient().on("config.changed", () => {
      fetchStatus();
    });

    return () => {
      clearInterval(interval);
      unsubscribeConfigChanged();
    };
  }, []);

  const currentProvider = providers.find((p) => p.id === agentStatus?.currentProvider);

  const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: "chat", label: "Chat", icon: <MessageSquare className="w-4 h-4" /> },
    { id: "status", label: "Status", icon: <Activity className="w-4 h-4" /> },
    { id: "config", label: "Config", icon: <Settings className="w-4 h-4" /> },
    { id: "plugins", label: "Plugins", icon: <Puzzle className="w-4 h-4" /> },
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
                    restarting
                      ? "bg-amber-500 animate-pulse"
                      : state === "connected"
                      ? "bg-green-500"
                      : state === "reconnecting"
                      ? "bg-amber-500"
                      : "bg-red-500"
                  }`}
                />
                <span className="text-[11px] text-stone-500 capitalize">
                  {restarting ? "restarting" : state}
                </span>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-2 space-y-0.5">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-150 flex items-center gap-2.5 ${
                  page === item.id
                    ? "bg-amber-500/15 text-amber-400 font-medium shadow-sm shadow-amber-500/5"
                    : "text-stone-400 hover:bg-stone-800/80 hover:text-stone-200"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          {/* Current Provider 显示 */}
          <div className="p-3 border-t border-stone-800">
            {agentStatus?.providerReady && currentProvider ? (
              <button
                onClick={() => setPage("config")}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-stone-800 transition-colors text-left"
                title={`${currentProvider.name} — Click to change`}
              >
                {currentProvider.logo ? (
                  <div className="w-5 h-5 rounded bg-white/10 p-0.5 shrink-0">
                    <img
                      src={currentProvider.logo}
                      alt=""
                      className="w-full h-full object-contain"
                      style={{ filter: "invert(1) brightness(2)" }}
                    />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded bg-stone-700 flex items-center justify-center text-[10px] text-stone-400 shrink-0">
                    {currentProvider.name.slice(0, 2)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs text-stone-300 truncate">{currentProvider.name}</p>
                  <p className="text-[10px] text-stone-600 truncate">{agentStatus?.currentModel || "auto"}</p>
                </div>
              </button>
            ) : (
              <button
                onClick={() => setPage("config")}
                className="w-full text-left px-2 py-1.5 text-xs text-amber-400 hover:bg-stone-800 rounded transition-colors"
              >
                ⚠ Configure provider
              </button>
            )}
            <p className="text-[10px] text-stone-600 mt-2">v0.1.0</p>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-auto">
            {page === "chat" && <ChatPage />}
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
