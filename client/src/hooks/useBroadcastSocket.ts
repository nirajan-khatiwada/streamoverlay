import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BroadcastEvent,
  ConnectionStatus,
  MatchSnapshot,
  ServerWsMessage,
  StudioConfig,
} from '@shared/types';

export interface SubAlertMessage {
  id: string;
  subscriberName: string;
  message: string;
  timestamp: string;
}

export interface BroadcastSocketState {
  wsConnected: boolean;
  snapshot: MatchSnapshot | null;
  config: StudioConfig | null;
  status: ConnectionStatus | null;
  recentEvents: BroadcastEvent[];
  latestEvent: BroadcastEvent | null;
  latestSubAlert: SubAlertMessage | null;
  clearLatestEvent: () => void;
}

export function useBroadcastSocket(): BroadcastSocketState {
  const [wsConnected, setWsConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [config, setConfig] = useState<StudioConfig | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [recentEvents, setRecentEvents] = useState<BroadcastEvent[]>([]);
  const [latestEvent, setLatestEvent] = useState<BroadcastEvent | null>(null);
  const [latestSubAlert, setLatestSubAlert] = useState<SubAlertMessage | null>(null);

  const reconnectTimerRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);

  const clearLatestEvent = useCallback(() => {
    setLatestEvent(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Immediate REST bootstrap so overlay renders before WS handshake even finishes
    fetch('/api/state')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mountedRef.current || !data) return;
        if (data.snapshot) setSnapshot(data.snapshot);
        if (data.config) setConfig(data.config);
        if (data.status) setStatus(data.status);
        if (Array.isArray(data.recentEvents)) setRecentEvents(data.recentEvents);
      })
      .catch(() => {
        // WS reconnect loop will recover
      });

    let attempt = 0;

    const connect = () => {
      if (!mountedRef.current) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        attempt = 0;
        setWsConnected(true);
      };

      ws.onmessage = (msgEvent) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(String(msgEvent.data)) as ServerWsMessage;
          switch (msg.type) {
            case 'init':
              setSnapshot(msg.payload.snapshot);
              setConfig(msg.payload.config);
              setStatus(msg.payload.status);
              setRecentEvents(msg.payload.recentEvents);
              break;
            case 'snapshot':
              setSnapshot(msg.payload);
              break;
            case 'config':
              setConfig(msg.payload);
              break;
            case 'status':
              setStatus(msg.payload);
              break;
            case 'event':
              setLatestEvent(msg.payload);
              setRecentEvents((prev) => [msg.payload, ...prev].slice(0, 30));
              break;
            case 'sub_alert':
              setLatestSubAlert(msg.payload);
              break;
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setWsConnected(false);
        const delay = Math.min(8000, 600 * Math.pow(1.6, attempt));
        attempt += 1;
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, []);

  return {
    wsConnected,
    snapshot,
    config,
    status,
    recentEvents,
    latestEvent,
    latestSubAlert,
    clearLatestEvent,
  };
}
