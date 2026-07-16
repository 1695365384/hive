import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Plug } from "lucide-react";
import { useWsClient } from "../hooks/use-ws-client";

interface CatalogEntry {
  id: string;
  title: string;
  description: string;
  region: string;
  status: "live" | "comingSoon";
  builtin: boolean;
  transport: "stdio" | "http";
  enabled?: boolean;
}

interface CatalogResult {
  title: string;
  description: string;
  entries: CatalogEntry[];
}

interface ListedServer {
  id: string;
  connected: boolean;
  toolCount: number;
  tools: string[];
  transport: string;
}

export function McpPage() {
  const { t } = useTranslation();
  const { request, onEvent } = useWsClient();

  const [catalog, setCatalog] = useState<CatalogResult | null>(null);
  const [servers, setServers] = useState<ListedServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadList = useCallback(() => {
    request<{ servers: ListedServer[] }>("mcp.list")
      .then((data) => setServers(data.servers ?? []))
      .catch(() => setServers([]));
  }, [request]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await request<CatalogResult>("mcp.catalog");
      setCatalog(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("mcp.loadFailed"));
      setCatalog(null);
    }
    setLoading(false);
  }, [request, t]);

  const refresh = useCallback(async () => {
    await loadCatalog();
    loadList();
  }, [loadCatalog, loadList]);

  useEffect(() => {
    void refresh();
    const unsub1 = onEvent("mcp.enabled", () => {
      void refresh();
    });
    const unsub2 = onEvent("mcp.disabled", () => {
      void refresh();
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, [refresh, onEvent]);

  const handleEnable = async (entry: CatalogEntry) => {
    if (entry.builtin || entry.status === "comingSoon") return;
    setBusyId(entry.id);
    setError("");
    try {
      await request("mcp.enable", { id: entry.id });
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("mcp.enableFailed"));
    }
    setBusyId(null);
  };

  const handleDisable = async (entry: CatalogEntry) => {
    if (entry.builtin) return;
    setBusyId(entry.id);
    setError("");
    try {
      await request("mcp.disable", { id: entry.id });
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("mcp.disableFailed"));
    }
    setBusyId(null);
  };

  const entries = catalog?.entries ?? [];

  return (
    <div className="h-full p-6 space-y-6 overflow-y-auto">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{t("mcp.title")}</h2>
        <p className="text-xs text-stone-500">
          {t("mcp.subtitle", {
            title: catalog?.title || "Hive MCP",
            count: entries.length,
          })}
        </p>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="bg-stone-900 rounded-lg p-4 space-y-3 border border-stone-800">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider">
            {t("mcp.catalog", { count: entries.length })}
          </h3>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("mcp.refresh")}
          </button>
        </div>

        {loading && !catalog ? (
          <p className="text-sm text-stone-500">{t("mcp.loading")}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-stone-500">{t("mcp.noCatalog")}</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => {
              const enabled = Boolean(entry.enabled);
              const comingSoon = entry.status === "comingSoon";
              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-3 bg-stone-800 rounded gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate flex items-center gap-2">
                      <Plug className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                      {entry.title}
                    </p>
                    <p className="text-xs text-stone-500 truncate">
                      {entry.region}
                      {entry.description ? ` · ${entry.description}` : ""}
                    </p>
                  </div>
                  {entry.builtin ? (
                    <span className="shrink-0 px-3 py-1 text-xs bg-stone-700 text-stone-400 rounded">
                      {enabled ? t("mcp.builtinOn") : t("mcp.builtin")}
                    </span>
                  ) : comingSoon ? (
                    <span className="shrink-0 px-3 py-1 text-xs text-stone-500 rounded border border-stone-700">
                      {t("mcp.comingSoon")}
                    </span>
                  ) : enabled ? (
                    <button
                      type="button"
                      onClick={() => void handleDisable(entry)}
                      disabled={busyId === entry.id}
                      className="shrink-0 px-3 py-1 text-xs text-red-400 hover:bg-red-400/10 disabled:opacity-50 rounded transition-colors"
                    >
                      {busyId === entry.id ? "…" : t("mcp.disable")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleEnable(entry)}
                      disabled={busyId === entry.id}
                      className="shrink-0 px-3 py-1 text-xs bg-amber-600 hover:bg-amber-700 disabled:bg-stone-700 rounded transition-colors"
                    >
                      {busyId === entry.id ? t("mcp.enabling") : t("mcp.enable")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-stone-900 rounded-lg p-4 space-y-3 border border-stone-800">
        <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider">
          {t("mcp.connected", { count: servers.length })}
        </h3>
        {servers.length === 0 ? (
          <p className="text-sm text-stone-500">{t("mcp.noConnected")}</p>
        ) : (
          <div className="space-y-2">
            {servers.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-3 bg-stone-800 rounded gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.id}</p>
                  <p className="text-xs text-stone-500 truncate">
                    {s.transport} · {s.connected ? t("mcp.online") : t("mcp.offline")} ·{" "}
                    {t("mcp.toolCount", { count: s.toolCount })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
