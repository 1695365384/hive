import { useEffect, useState, useCallback } from "react";
import { getChatWsClient, type ConnectionState } from "../lib/ws-client";

export function useChatWsClient() {
  const [state, setState] = useState<ConnectionState>("reconnecting");

  useEffect(() => {
    const client = getChatWsClient();
    const unsubscribe = client.onStateChange(setState);
    return unsubscribe;
  }, []);

  const request = useCallback(async <T = any>(method: string, params?: unknown): Promise<T> => {
    const client = getChatWsClient();
    return client.request<T>(method, params);
  }, []);

  const onEvent = useCallback(<T = any>(event: string, callback: (data: T) => void) => {
    const client = getChatWsClient();
    return client.on(event, callback as any);
  }, []);

  return { state, request, onEvent };
}
