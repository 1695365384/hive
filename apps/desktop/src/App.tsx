import { useState, useEffect } from "react";
import { useWsClient } from "./hooks/use-ws-client";
import { getWsClient } from "./lib/ws-client";
import { SetupWizard } from "./pages/SetupWizard";
import { Dashboard } from "./pages/Dashboard";
import "./App.css";

export default function App() {
  const { state } = useWsClient();
  const [providerReady, setProviderReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (state !== "connected") return;

    getWsClient()
      .request<{ agent: { providerReady: boolean } }>("status.get")
      .then((status) => {
        setProviderReady(status?.agent?.providerReady ?? false);
      })
      .catch(() => {
        setProviderReady(false);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [state]);

  if (state === "reconnecting") {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-gray-600 border-t-gray-400 rounded-full mx-auto mb-4" />
          <p>Connecting to Hive Server...</p>
        </div>
      </div>
    );
  }

  if (state === "failed") {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
        <div className="text-center">
          <p className="text-red-400 mb-2">Failed to connect to Hive Server</p>
          <p className="text-sm">Please check that the server is running on port 4450</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-400">
        <div className="animate-spin h-8 w-8 border-2 border-gray-600 border-t-gray-400 rounded-full" />
      </div>
    );
  }

  if (providerReady === false) {
    return <SetupWizard onComplete={() => setProviderReady(true)} />;
  }

  return <Dashboard />;
}
