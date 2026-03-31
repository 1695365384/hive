import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useLogStore } from "../stores/log-store";
import { getWsClient } from "../lib/ws-client";
import { getTodayDateStr } from "../stores/log-store";

const LEVEL_COLORS: Record<string, string> = {
  debug: "text-stone-500",
  info: "text-stone-400",
  warn: "text-orange-400",
  error: "text-red-400",
};

type DrawerHeight = "collapsed" | "half" | "full";

interface LogDrawerProps {
  height: DrawerHeight;
  onHeightChange: (h: DrawerHeight) => void;
}

export function LogDrawer({ height, onHeightChange }: LogDrawerProps) {
  const logs = useLogStore((s) => s.logs);
  const clearUnread = useLogStore((s) => s.clearUnread);
  const selectedDate = useLogStore((s) => s.selectedDate);
  const setSelectedDate = useLogStore((s) => s.setSelectedDate);
  const setHistoryLogs = useLogStore((s) => s.setHistoryLogs);
  const [filter, setFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [dates, setDates] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  // Fetch available dates on mount
  useEffect(() => {
    const client = getWsClient();
    client.request<string[]>("log.listDates").then((d) => {
      if (d) setDates(d);
    }).catch(() => {});
  }, []);

  // Clear unread when drawer opens
  useEffect(() => {
    if (height !== "collapsed") {
      clearUnread();
    }
  }, [height, clearUnread]);

  // Auto scroll
  useEffect(() => {
    if (autoScroll && height !== "collapsed" && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll, height]);

  const handleDateChange = useCallback(
    async (value: string) => {
      if (value === "__today__") {
        setSelectedDate(null);
        return;
      }
      setSelectedDate(value);
      if (loadingRef.current) return;
      loadingRef.current = true;
      try {
        const client = getWsClient();
        const entries = await client.request<any[]>("log.getByDate", {
          date: value,
          limit: 200,
        });
        setHistoryLogs(entries ?? []);
      } catch {
        setHistoryLogs([]);
      }
      loadingRef.current = false;
    },
    [setSelectedDate, setHistoryLogs],
  );

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (levelFilter && log.level !== levelFilter) return false;
      if (filter && !log.message.toLowerCase().includes(filter.toLowerCase()))
        return false;
      return true;
    });
  }, [logs, levelFilter, filter]);

  if (height === "collapsed") return null;

  const heightClass = height === "half" ? "h-[40vh]" : "h-[75vh]";
  const todayStr = getTodayDateStr();

  return (
    <div className={`border-t border-stone-800 flex flex-col ${heightClass} transition-all duration-200`}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-stone-800 shrink-0">
        <button
          onClick={() => onHeightChange("collapsed")}
          className="text-stone-500 hover:text-stone-300 text-xs px-1"
          title="Close"
        >
          ▼
        </button>
        {/* Date selector */}
        <select
          value={selectedDate ?? "__today__"}
          onChange={(e) => handleDateChange(e.target.value)}
          className="bg-stone-800 border border-stone-700 rounded px-2 py-1 text-xs text-stone-300"
        >
          <option value="__today__">Today</option>
          {dates
            .filter((d) => d !== todayStr)
            .map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
        </select>
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="bg-stone-800 border border-stone-700 rounded px-2 py-1 text-xs text-stone-300"
        >
          <option value="">All</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter..."
          className="flex-1 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-xs text-stone-100 placeholder-stone-500"
        />
        <span className="text-xs text-stone-600">{filteredLogs.length}</span>
        <button
          onClick={() => setAutoScroll(true)}
          className={`text-xs px-2 py-1 rounded ${autoScroll ? "bg-amber-600/20 text-amber-400" : "text-stone-500"}`}
        >
          Auto
        </button>
        <button
          onClick={() => onHeightChange(height === "half" ? "full" : "half")}
          className="text-xs px-2 py-1 rounded text-stone-500 hover:text-stone-300"
        >
          {height === "half" ? "⬆" : "⬇"}
        </button>
      </div>

      {/* Log List */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto px-3 py-1 font-mono text-xs space-y-0.5"
      >
        {selectedDate && (
          <div className="text-amber-400/70 text-center py-1 border-b border-stone-800 mb-1">
            Viewing: {selectedDate}
          </div>
        )}
        {filteredLogs.map((log) => (
          <div key={log.id} className="flex gap-2">
            <span className="text-stone-600 w-20 shrink-0">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span className={`w-12 shrink-0 uppercase ${LEVEL_COLORS[log.level] ?? "text-stone-400"}`}>
              {log.level}
            </span>
            <span className="text-stone-600 w-24 shrink-0 truncate">
              [{log.source}]
            </span>
            <span className="text-stone-300 break-all">{log.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
