import { useState, useEffect } from "react";
import { useWsClient } from "./hooks/use-ws-client";
import { getWsClient } from "./lib/ws-client";
import { SetupWizard } from "./pages/SetupWizard";
import { Dashboard } from "./pages/Dashboard";
import "./App.css";

export default function App() {
  const { state } = useWsClient();
  const [providerReady, setProviderReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (state !== "connected") return;

    getWsClient()
      .request<{ agent: { providerReady: boolean } }>("status.get")
      .then((status) => {
        console.log(status,'状态');
        
        setProviderReady(status?.agent?.providerReady);
      })
      .catch((err) => {
        console.log(err,'状态错误');
        setProviderReady(false);
      });
  }, [state]);

  // 重连中
  if (state === "reconnecting" && providerReady === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-stone-950 text-stone-400">
        <div className="text-center">
          <img src="/logo.svg" alt="Hive" className="w-16 h-16 mx-auto mb-6 opacity-60" />
          <div className="animate-spin h-8 w-8 border-2 border-stone-700 border-t-amber-500 rounded-full mx-auto mb-4" />
          <p>Connecting to Hive Server...</p>
        </div>
      </div>
    );
  }

  // 连接失败，提供重试
  if (state === "failed") {
    return (
      <div className="flex items-center justify-center h-screen bg-stone-950 text-stone-400">
        <div className="text-center">
          <img src="/logo.svg" alt="Hive" className="w-16 h-16 mx-auto mb-6 opacity-60" />
          <p className="text-red-400 mb-2">Failed to connect to Hive Server</p>
          <p className="text-sm text-stone-500 mb-4">Please check that the server is running on port 4450</p>
          <button
            onClick={() => getWsClient().reconnect()}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // 已连接但未配置 provider → 引导向导
  if (providerReady === false) {
    return <SetupWizard onComplete={() => setProviderReady(true)} />;
  }

  // 正常状态（已连接）
  return <Dashboard />;
}
