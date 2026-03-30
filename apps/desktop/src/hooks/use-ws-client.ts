import { useEffect, useState, useCallback } from "react";
import { getWsClient, type ConnectionState } from "../lib/ws-client";

export function useWsClient() {
  const [state, setState] = useState<ConnectionState>("reconnecting");

  useEffect(() => {
    const client = getWsClient();
    const unsubscribe = client.onStateChange(setState);
    return unsubscribe;
  }, []);

  const request = useCallback(async <T = any>(method: string, params?: unknown): Promise<T> => {
    const client = getWsClient();
    return client.request<T>(method, params);
  }, []);

  const onEvent = useCallback(<T = any>(event: string, callback: (data: T) => void) => {
    const client = getWsClient();
    return client.on(event, callback as any);
  }, []);

  return { state, request, onEvent };
}
