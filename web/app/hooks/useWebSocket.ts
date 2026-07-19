"use client";

import { useEffect, useRef, useState } from "react";
import { API_URL } from "../lib/api";

export interface WSEvent {
  type: string;
  tenant_id?: string;
  ts?: string;
  [key: string]: unknown;
}

const WS_BASE = API_URL.replace(/^https:/, "wss:").replace(/^http:/, "ws:");

const PING_INTERVAL_MS = 25_000;
const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

/**
 * Connect to the PackGuardian WebSocket and receive real-time events.
 *
 * Returns:
 *   lastEvent  — the most recent parsed WS event (null until first message)
 *   connected  — whether the socket is currently open
 *
 * The hook manages reconnection with exponential backoff automatically.
 * Pass null/undefined for token to stay disconnected (e.g. not authenticated).
 */
export function useWebSocket(token: string | null | undefined): {
  lastEvent: WSEvent | null;
  connected: boolean;
} {
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);
  const [connected, setConnected] = useState(false);

  // Use a ref for the retry delay so it persists across reconnects without
  // causing extra renders
  const retryDelay = useRef(INITIAL_RETRY_MS);
  const unmounted = useRef(false);

  useEffect(() => {
    if (!token) return;
    const safeToken = token;
    unmounted.current = false;

    let ws: WebSocket;
    let pingTimer: ReturnType<typeof setInterval>;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const url = `${WS_BASE}/ws?token=${encodeURIComponent(safeToken)}`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        setConnected(true);
        retryDelay.current = INITIAL_RETRY_MS; // reset backoff on success
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (e: MessageEvent) => {
        if (e.data === "pong") return; // heartbeat ack
        try {
          const parsed = JSON.parse(e.data) as WSEvent;
          setLastEvent(parsed);
        } catch {
          // malformed message — ignore
        }
      };

      ws.onclose = () => {
        clearInterval(pingTimer);
        setConnected(false);
        if (unmounted.current) return;
        retryTimer = setTimeout(() => {
          retryDelay.current = Math.min(retryDelay.current * 2, MAX_RETRY_MS);
          connect();
        }, retryDelay.current);
      };

      ws.onerror = () => {
        ws.close(); // triggers onclose → retry
      };
    }

    connect();

    return () => {
      unmounted.current = true;
      clearInterval(pingTimer);
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, [token]);

  return { lastEvent, connected };
}
