import { useEffect, useRef } from "react";
import { getWsClient } from "../lib/ws-client";
import { useLogStore } from "../stores/log-store";
import type { ConnectionState } from "../lib/ws-client";

/**
 * 轮询 log.tail 接口，增量拉取新日志写入 zustand store。
 * 使用递归 setTimeout 而非 setInterval，避免内存泄漏风险。
 * 仅在 WS 连接状态下且处于 live mode（selectedDate === null）时运行。
 */
export function useLogPolling(intervalMs = 1000) {
  const addLogs = useLogStore((s) => s.addLogs);
  const stateRef = useRef<ConnectionState>("reconnecting");
  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const client = getWsClient();
    const cleanups: Array<() => void> = [];

    cleanups.push(
      client.onStateChange((s) => {
        stateRef.current = s;
      }),
    );

    const poll = async () => {
      if (!runningRef.current) return;
      // 非 live mode 时暂停轮询，1s 后重新检查
      if (useLogStore.getState().selectedDate !== null) {
        timerRef.current = setTimeout(poll, 1000);
        return;
      }
      if (stateRef.current !== "connected") {
        timerRef.current = setTimeout(poll, 1000);
        return;
      }
      try {
        const entries = await client.request<any[]>("log.tail", {
          sinceId: useLogStore.getState().lastId,
          limit: 200,
        });
        if (entries && entries.length > 0) {
          addLogs(entries);
        }
      } catch {
        // 忽略单次轮询失败
      }
      timerRef.current = setTimeout(poll, intervalMs);
    };

    const loadHistory = async () => {
      if (stateRef.current !== "connected") return;
      try {
        // 优先从内存 LogBuffer 加载（重连场景，避免与文件重复）
        let entries = await client.request<any[]>("log.getHistory", { limit: 200 });
        // LogBuffer 为空时（server 刚重启），从日志文件回读
        if (!entries || entries.length === 0) {
          const todayStr = new Date().toISOString().slice(0, 10);
          entries = await client.request<any[]>("log.getByDate", {
            date: todayStr,
            limit: 200,
          });
        }
        if (entries && entries.length > 0) {
          useLogStore.getState().addLogs(entries);
          useLogStore.getState().clearUnread();
        }
      } catch {
        // 忽略
      }
    };

    const startPolling = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      await loadHistory();
      timerRef.current = setTimeout(poll, intervalMs);
    };

    if (stateRef.current === "connected") {
      startPolling();
    } else {
      const unsub = client.onStateChange((s) => {
        if (s === "connected") {
          startPolling();
          unsub();
        }
      });
      cleanups.push(unsub);
    }

    return () => {
      runningRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      for (const cleanup of cleanups) cleanup();
    };
  }, [addLogs, intervalMs]);
}
