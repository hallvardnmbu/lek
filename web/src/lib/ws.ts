import { createSignal, onCleanup } from 'solid-js';
import type { ClientMessage, GameAction, RoomState, ServerMessage } from '../../../shared/protocol';

const SESSION_KEY_PLAYER = 'party_player_session';
const SESSION_KEY_HOST = 'party_host_token';

export interface StoredPlayerSession {
  code: string;
  playerId: string;
  name: string;
}

export function loadPlayerSession(): StoredPlayerSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_PLAYER);
    return raw ? (JSON.parse(raw) as StoredPlayerSession) : null;
  } catch {
    return null;
  }
}

export function savePlayerSession(session: StoredPlayerSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY_PLAYER, JSON.stringify(session));
  } catch {
    // Ignore storage errors
  }
}

export function clearPlayerSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY_PLAYER);
  } catch {
    // Ignore
  }
}

export function loadHostToken(): string | undefined {
  try {
    return sessionStorage.getItem(SESSION_KEY_HOST) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveHostToken(token: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY_HOST, token);
  } catch {
    // Ignore
  }
}

export function createGameSocket(options: {
  onOpen?: (send: (msg: ClientMessage) => void) => void;
  onMessage?: (msg: ServerMessage) => void;
  onEvent?: (event: string, payload: unknown) => void;
}) {
  const [connected, setConnected] = createSignal(false);
  const [roomState, setRoomState] = createSignal<RoomState | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [remainingMs, setRemainingMs] = createSignal<number | null>(null);
  const [lastEvent, setLastEvent] = createSignal<{ event: string; payload: unknown; at: number } | null>(null);

  let ws: WebSocket | null = null;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const wsUrl = () => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  };

  const send = (msg: ClientMessage) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  const sendAction = (
    action: GameAction,
    actor: { playerId?: string; hostToken?: string }
  ) => {
    const s = roomState();
    if (!s) return;
    send({
      type: 'game_action',
      payload: {
        code: s.code,
        roundId: s.roundId,
        playerId: actor.playerId,
        hostToken: actor.hostToken,
        action,
      },
    });
  };

  const connect = () => {
    if (disposed) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    ws = new WebSocket(wsUrl());

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        send({ type: 'ping', payload: { ts: Date.now() } });
      }, 15_000);
      options.onOpen?.(send);
    };

    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }

      if (msg.type === 'room_state') {
        setRoomState(msg.payload);
        if (msg.payload.phaseEndsAt !== null) {
          setRemainingMs(Math.max(0, msg.payload.phaseEndsAt - Date.now()));
        } else {
          setRemainingMs(null);
        }
      } else if (msg.type === 'tick') {
        setRemainingMs(msg.payload.remainingMs);
      } else if (msg.type === 'game_event') {
        setLastEvent({ event: msg.payload.event, payload: msg.payload.payload, at: Date.now() });
        options.onEvent?.(msg.payload.event, msg.payload.payload);
      } else if (msg.type === 'error') {
        setError(msg.payload.message);
      }

      options.onMessage?.(msg);
    };

    ws.onclose = () => {
      setConnected(false);
      clearInterval(pingTimer);
      if (!disposed) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 1500);
      }
    };

    ws.onerror = () => {
      ws?.close();
    };
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && (!ws || ws.readyState !== WebSocket.OPEN)) {
      connect();
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  connect();

  onCleanup(() => {
    disposed = true;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    clearInterval(pingTimer);
    clearTimeout(reconnectTimer);
    ws?.close();
  });

  return {
    connected,
    roomState,
    error,
    setError,
    remainingMs,
    lastEvent,
    send,
    sendAction,
  };
}
