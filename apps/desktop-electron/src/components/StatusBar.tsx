import { useTranslation } from "react-i18next";
import { useWsClient } from "../hooks/use-ws-client";
import { useLogStore } from "../stores/log-store";
import { useServerStore } from "../stores/server-store";

type DrawerHeight = "collapsed" | "half" | "full";

interface StatusBarProps {
  drawerHeight: DrawerHeight;
  onToggle: () => void;
}

export function StatusBar({ drawerHeight, onToggle }: StatusBarProps) {
  const { t } = useTranslation();
  const unreadCount = useLogStore((s) => s.unreadCount);
  const errorCount = useLogStore((s) => s.errorCount);
  const { state } = useWsClient();
  const restarting = useServerStore((s) => s.restarting);

  const wsLabel = restarting
    ? t("ws.restarting")
    : state === "connected"
      ? t("ws.connected")
      : state === "reconnecting"
        ? t("ws.reconnecting")
        : t("ws.failed");

  return (
    <div className="flex items-center justify-between px-3 py-1 border-t border-stone-800 bg-stone-900 text-xs text-stone-500 shrink-0 select-none">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
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
          <span className="capitalize">{wsLabel}</span>
        </div>
      </div>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 hover:text-stone-300 transition-colors"
      >
        {errorCount > 0 && (
          <span className="text-red-400">{t("logs.errorCount", { count: errorCount })}</span>
        )}
        {unreadCount > 0 && (
          <span className="text-amber-400">{t("logs.newCount", { count: unreadCount })}</span>
        )}
        <span>
          {t("logs.title")} {drawerHeight !== "collapsed" ? "▼" : "▲"}
        </span>
      </button>
    </div>
  );
}
