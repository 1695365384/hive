import { useEffect, useRef } from "react";
import { getWsClient } from "../lib/ws-client";
import { useLogStore } from "../stores/log-store";
import type { LogEntry } from "../stores/log-store";
import type { ConnectionState } from "../lib/ws-client";

/**
 * 日志实时推送 + 轮询兜底
 *
 * 1. 首次连接：拉取历史日志（log.getHistory / log.getByDate）
 * 2. 实时推送：log.subscribe + client.on('log') 实时接收
 * 3. 轮询兜底：WS 断开时自动降级为 log.tail 轮询，重连后恢复订阅
 */

const POLL_INTERVAL_MS = 1000;

export function useLogPolling() {
  const addLogs = useLogStore((s) => s.addLogs);
  const stateRef = useRef<ConnectionState>("reconnecting");
  const subscribedRef = useRef(false);
  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubLogEventRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const client = getWsClient();
    const cleanups: Array<() => void> = [];

    cleanups.push(
      client.onStateChange((s) => {
        stateRef.current = s;
      }),
    );

    // ---- 订阅实时推送 ----
    const subscribe = async () => {
      if (subscribedRef.current) return;
      try {
        await client.request("log.subscribe");
        subscribedRef.current = true;
      } catch {
        // 订阅失败，轮询兜底
      }
    };

    // ---- 取消订阅 ----
    const unsubscribe = async () => {
      if (!subscribedRef.current) return;
      try {
        await client.request("log.unsubscribe");
      } catch {
        // ignore
      }
      subscribedRef.current = false;
    };

    // ---- 监听实时日志事件 ----
    const startEventListener = () => {
      if (unsubLogEventRef.current) return;
      unsubLogEventRef.current = client.on("log", (entry: LogEntry) => {
        addLogs([entry]);
      });
    };

    const stopEventListener = () => {
      if (unsubLogEventRef.current) {
        unsubLogEventRef.current();
        unsubLogEventRef.current = null;
      }
    };

    // ---- 轮询（兜底） ----
    const poll = async () => {
      if (!runningRef.current) return;
      if (useLogStore.getState().selectedDate !== null) {
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }
      if (stateRef.current !== "connected") {
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }
      // 已订阅时跳过轮询，依赖实时推送
      if (subscribedRef.current) {
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }
      try {
        const entries = await client.request<LogEntry[]>("log.tail", {
          sinceId: useLogStore.getState().lastId,
          limit: 200,
        });
        if (entries && entries.length > 0) {
          addLogs(entries);
        }
      } catch {
        // 忽略单次轮询失败
      }
      timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    };

    // ---- 拉取历史日志 ----
    const loadHistory = async () => {
      if (stateRef.current !== "connected") return;
      try {
        let entries = await client.request<LogEntry[]>("log.getHistory", {
          limit: 200,
        });
        if (!entries || entries.length === 0) {
          const todayStr = new Date().toISOString().slice(0, 10);
          entries = await client.request<LogEntry[]>("log.getByDate", {
            date: todayStr,
            limit: 200,
          });
        }
        if (entries && entries.length > 0) {
          useLogStore.getState().addLogs(entries);
          useLogStore.getState().clearUnread();
        }
      } catch {
        // ignore
      }
    };

    // ---- 启动 ----
    const start = async () => {
      if (runningRef.current) return;
      runningRef.current = true;

      await loadHistory();
      await subscribe();
      startEventListener();
      timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    };

    // ---- 断开处理 ----
    const onDisconnect = () => {
      subscribedRef.current = false;
      stopEventListener();
    };

    // ---- 重连处理 ----
    const onReconnect = () => {
      loadHistory().then(() => {
        subscribe();
        startEventListener();
      });
    };

    if (stateRef.current === "connected") {
      start();
    } else {
      const unsub = client.onStateChange((s) => {
        if (s === "connected") {
          start();
          unsub();
        }
      });
      cleanups.push(unsub);
    }

    // 监听断开/重连
    const unsubState = client.onStateChange((s) => {
      if (s === "reconnecting" || s === "failed") {
        onDisconnect();
      } else if (s === "connected" && runningRef.current) {
        onReconnect();
      }
    });
    cleanups.push(unsubState);

    return () => {
      runningRef.current = false;
      subscribedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      stopEventListener();
      unsubscribe();
      for (const cleanup of cleanups) cleanup();
    };
  }, [addLogs]);
}
