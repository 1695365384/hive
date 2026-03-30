import { useEffect, useState, useRef, useCallback } from "react";
import { useWsClient } from "../hooks/use-ws-client";

interface LogEntry {
  id: string;
  level: string;
  source: string;
  message: string;
  timestamp: number;
}

const LEVEL_COLORS: Record<string, string> = {
  debug: "text-gray-500",
  info: "text-blue-400",
  warn: "text-yellow-400",
  error: "text-red-400",
};

export function LogViewer() {
  const { request, onEvent } = useWsClient();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [levelFilter, setLevelFilter] = useState<string>("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load history on mount
  useEffect(() => {
    request<LogEntry[]>("log.getHistory", { limit: 100 }).then((data) => {
      setLogs(data ?? []);
    }).catch(() => {});
  }, []);

  // Subscribe to live logs
  useEffect(() => {
    if (subscribed) return;
    setSubscribed(true);

    const unsubscribe = onEvent<LogEntry>("log", (entry) => {
      setLogs((prev) => [...prev, entry]);
    });

    request("log.subscribe").catch(() => {});

    return () => {
      unsubscribe();
      request("log.unsubscribe").catch(() => {});
    };
  }, []);

  // Auto scroll
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  // Detect manual scroll
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(atBottom);
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (levelFilter && log.level !== levelFilter) return false;
    if (filter && !log.message.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 p-3 border-b border-gray-800">
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300"
        >
          <option value="">All Levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
        </select>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter logs..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm text-white placeholder-gray-500"
        />
        <span className="text-xs text-gray-500">{filteredLogs.length} logs</span>
        <button
          onClick={() => setAutoScroll(true)}
          className={`text-xs px-2 py-1 rounded ${autoScroll ? "bg-blue-600" : "bg-gray-800"} transition-colors`}
        >
          Auto Scroll
        </button>
      </div>

      {/* Log List */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-3 font-mono text-xs space-y-0.5"
      >
        {filteredLogs.map((log) => (
          <div key={log.id} className="flex gap-2">
            <span className="text-gray-600 w-20 shrink-0">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span className={`w-12 shrink-0 uppercase ${LEVEL_COLORS[log.level] ?? "text-gray-400"}`}>
              {log.level}
            </span>
            <span className="text-gray-600 w-24 shrink-0 truncate">
              [{log.source}]
            </span>
            <span className="text-gray-300 break-all">{log.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
