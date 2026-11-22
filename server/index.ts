import { join, resolve, sep } from 'path';
import type { ServerWebSocket } from 'bun';
import type { ClientMessage, ServerMessage } from '../shared/protocol';
import { RoomManager, type ActionResult, type InternalRoom, type RoomBroadcaster } from './roomManager';
import { verifyWebhookSignature } from './webhooks';
import { handleGameApi, initGames } from './games';
import type { GamePlayer } from './game';

interface SocketData {
  roomCode?: string;
  role?: 'host' | 'player';
  playerId?: string;
}

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const WEB_DIST_DIR = resolve(import.meta.dir, '../web/dist');

const hostSockets = new Map<string, Set<ServerWebSocket<SocketData>>>();
const playerSockets = new Map<string, Map<string, ServerWebSocket<SocketData>>>();

function safeSend(ws: ServerWebSocket<SocketData>, message: ServerMessage): void {
  try {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  } catch {
    // Socket may be closing
  }
}

function sendError(ws: ServerWebSocket<SocketData>, code: string, message: string): void {
  safeSend(ws, { type: 'error', payload: { code, message } });
}

function sendResultError(
  ws: ServerWebSocket<SocketData>,
  res: { ok: boolean; code?: string; message?: string }
): void {
  if (!res.ok) {
    sendError(ws, res.code ?? 'ERROR', res.message ?? 'Request failed.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function resolveActor(
  ws: ServerWebSocket<SocketData>,
  payload: Record<string, unknown>
): { ok: true; actor: { playerId?: string; hostToken?: string } } | { ok: false } {
  const hostToken = asString(payload.hostToken);
  const payloadPlayerId = asString(payload.playerId);

  if (ws.data.role === 'player') {
    if (payloadPlayerId && payloadPlayerId !== ws.data.playerId) {
      return { ok: false };
    }
    return { ok: true, actor: { playerId: ws.data.playerId, hostToken } };
  }

  if (ws.data.role === 'host') {
    return { ok: true, actor: { hostToken } };
  }

  return { ok: true, actor: { playerId: payloadPlayerId, hostToken } };
}

function sendJoinedState(
  ws: ServerWebSocket<SocketData>,
  res: ActionResult<{ room: InternalRoom; player: GamePlayer }>
): void {
  if (!res.ok) {
    sendResultError(ws, res);
    return;
  }
  registerPlayerSocket(res.room.code, res.player.id, ws);
  safeSend(ws, {
    type: 'joined',
    payload: {
      code: res.room.code,
      playerId: res.player.id,
      name: res.player.name,
    },
  });
  safeSend(ws, {
    type: 'room_state',
    payload: roomManager.buildStateForClient(res.room, res.player.id),
  });
}

function withActorCode(
  ws: ServerWebSocket<SocketData>,
  payload: Record<string, unknown>,
  missingMsg: string,
  fn: (code: string, actor: { playerId?: string; hostToken?: string }) => ActionResult
): void {
  const code = asString(payload.code);
  if (!code) {
    sendError(ws, 'BAD_PAYLOAD', missingMsg);
    return;
  }
  const resolved = resolveActor(ws, payload);
  if (!resolved.ok) {
    sendError(ws, 'UNAUTHORIZED', 'Player identity mismatch.');
    return;
  }
  sendResultError(ws, fn(code, resolved.actor));
}

const broadcaster: RoomBroadcaster = {
  sendToHost(roomCode, message) {
    const hosts = hostSockets.get(roomCode);
    if (!hosts) return;
    for (const ws of hosts) {
      safeSend(ws, message as ServerMessage);
    }
  },
  sendToPlayer(roomCode, playerId, message) {
    const ws = playerSockets.get(roomCode)?.get(playerId);
    if (ws) {
      safeSend(ws, message as ServerMessage);
    }
  },
  broadcastAll(roomCode, message) {
    this.sendToHost(roomCode, message);
    const players = playerSockets.get(roomCode);
    if (!players) return;
    for (const ws of players.values()) {
      safeSend(ws, message as ServerMessage);
    }
  },
  onRoomDisposed(roomCode) {
    hostSockets.delete(roomCode);
    playerSockets.delete(roomCode);
  },
};

const roomManager = new RoomManager(broadcaster);

function registerHostSocket(roomCode: string, ws: ServerWebSocket<SocketData>): void {
  ws.data.roomCode = roomCode;
  ws.data.role = 'host';
  let set = hostSockets.get(roomCode);
  if (!set) {
    set = new Set();
    hostSockets.set(roomCode, set);
  }
  set.add(ws);
}

function registerPlayerSocket(
  roomCode: string,
  playerId: string,
  ws: ServerWebSocket<SocketData>
): void {
  ws.data.roomCode = roomCode;
  ws.data.role = 'player';
  ws.data.playerId = playerId;
  let map = playerSockets.get(roomCode);
  if (!map) {
    map = new Map();
    playerSockets.set(roomCode, map);
  }
  map.set(playerId, ws);
}

function unregisterPlayerSocket(roomCode: string, playerId: string, ws?: ServerWebSocket<SocketData>): boolean {
  const map = playerSockets.get(roomCode);
  if (!map) return false;
  if (!ws || map.get(playerId) === ws) {
    const deleted = map.delete(playerId);
    if (map.size === 0) {
      playerSockets.delete(roomCode);
    }
    return deleted;
  }
  return false;
}

async function handleApiRequest(req: Request, url: URL): Promise<Response | null> {
  if (url.pathname === '/health') {
    return Response.json({ ok: true, uptime: process.uptime() });
  }

  if (url.pathname === '/api/games' && req.method === 'GET') {
    return Response.json({ games: roomManager.registry.list() });
  }

  const gameApiResponse = handleGameApi(req, url);
  if (gameApiResponse) return gameApiResponse;

  const roomMatch = url.pathname.match(/^\/api\/rooms\/([A-Za-z]{4})$/);
  if (roomMatch && req.method === 'GET') {
    const room = roomManager.getRoom(roomMatch[1]);
    if (!room) {
      return Response.json({ error: 'Room not found' }, { status: 404 });
    }
    return Response.json({
      code: room.code,
      phase: room.phase,
      gameId: room.gameId,
      playerCount: room.players.size,
    });
  }

  const webhookMatch = url.pathname.match(/^\/api\/rooms\/([A-Za-z]{4})\/(webhook|events)$/);
  if (webhookMatch && req.method === 'POST') {
    const code = webhookMatch[1].toUpperCase();
    const room = roomManager.getRoom(code);
    if (!room) {
      return Response.json({ error: 'Room not found' }, { status: 404 });
    }

    const rawBody = await req.text();
    const webhookSecret = process.env.WEBHOOK_SECRET;
    const hostTokenHeader = req.headers.get('x-host-token');
    const authHeader = req.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const sigHeader = req.headers.get('x-webhook-signature');

    const authorizedByHost = roomManager.isValidHostToken(code, hostTokenHeader ?? bearerToken);
    const authorizedBySecret = Boolean(
      webhookSecret &&
        (bearerToken === webhookSecret || verifyWebhookSignature(rawBody, webhookSecret, sigHeader))
    );

    if (!authorizedByHost && !authorizedBySecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { event?: string; payload?: unknown };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body.event || typeof body.event !== 'string') {
      return Response.json({ error: 'Missing "event" field' }, { status: 400 });
    }

    const res = roomManager.handleExternalEvent(code, body.event, body.payload);
    if (!res.ok) {
      return Response.json({ error: res.message, code: res.code }, { status: 400 });
    }
    return Response.json({ ok: true });
  }

  return null;
}

async function serveStatic(pathname: string): Promise<Response> {
  const cleanPath = pathname === '/' ? '/index.html' : pathname;
  const candidate = resolve(WEB_DIST_DIR, `.${cleanPath}`);

  if (cleanPath !== '/index.html' && candidate.startsWith(WEB_DIST_DIR + sep)) {
    const file = Bun.file(candidate);
    if (await file.exists()) {
      return new Response(file);
    }
  }

  const indexFile = Bun.file(join(WEB_DIST_DIR, 'index.html'));
  if (await indexFile.exists()) {
    return new Response(indexFile, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  return new Response(
    'Frontend build not found. Run `bun run build:web` or use `bun run dev:web` during development.',
    { status: 404 }
  );
}

await initGames();

const server = Bun.serve<SocketData>({
  hostname: HOST,
  port: PORT,
  async fetch(req, serverInstance) {
    const url = new URL(req.url);

    if (url.pathname === '/ws') {
      const upgraded = serverInstance.upgrade(req, { data: {} });
      if (upgraded) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    const apiResponse = await handleApiRequest(req, url);
    if (apiResponse) return apiResponse;

    return serveStatic(url.pathname);
  },
  websocket: {
    idleTimeout: 120,
    open() {
      // Client registers via create_room, join_room, or reconnect
    },
    message(ws, raw) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
      } catch {
        sendError(ws, 'BAD_JSON', 'Invalid JSON message.');
        return;
      }

      if (!isRecord(parsed) || typeof parsed.type !== 'string') {
        sendError(ws, 'BAD_MESSAGE', 'Message must be an object with a string "type".');
        return;
      }

      const msg = parsed as ClientMessage;
      const payload = isRecord(parsed.payload) ? parsed.payload : {};

      switch (msg.type) {
        case 'ping': {
          const ts = typeof payload.ts === 'number' ? payload.ts : Date.now();
          safeSend(ws, { type: 'pong', payload: { ts } });
          return;
        }

        case 'create_room': {
          const { room, hostToken } = roomManager.createRoom(
            asString(payload.hostToken),
            asString(payload.gameId)
          );
          registerHostSocket(room.code, ws);
          safeSend(ws, {
            type: 'room_created',
            payload: { code: room.code, hostToken },
          });
          safeSend(ws, {
            type: 'room_state',
            payload: roomManager.buildStateForClient(room),
          });
          return;
        }

        case 'join_room': {
          const code = asString(payload.code);
          const name = asString(payload.name);
          if (!code || !name) {
            sendError(ws, 'BAD_PAYLOAD', 'join_room requires string "code" and "name".');
            return;
          }
          sendJoinedState(ws, roomManager.joinRoom(code, name, asString(payload.playerId)));
          return;
        }

        case 'reconnect': {
          const code = asString(payload.code);
          const playerId = asString(payload.playerId);
          if (!code || !playerId) {
            sendError(ws, 'BAD_PAYLOAD', 'reconnect requires string "code" and "playerId".');
            return;
          }
          sendJoinedState(ws, roomManager.reconnectPlayer(code, playerId));
          return;
        }

        case 'leave_room': {
          const code = asString(payload.code);
          const resolved = resolveActor(ws, payload);
          const playerId = resolved.ok ? resolved.actor.playerId : undefined;
          if (!code || !playerId) {
            sendError(ws, 'BAD_PAYLOAD', 'leave_room requires valid "code" and "playerId".');
            return;
          }
          const res = roomManager.leaveRoom(code, playerId);
          if (!res.ok) {
            sendResultError(ws, res);
            return;
          }
          const normalizedCode = code.trim().toUpperCase();
          unregisterPlayerSocket(normalizedCode, playerId, ws);
          ws.data.roomCode = undefined;
          ws.data.playerId = undefined;
          safeSend(ws, {
            type: 'left',
            payload: { code: normalizedCode, playerId },
          });
          return;
        }

        case 'open_game_selector': {
          withActorCode(ws, payload, 'open_game_selector requires "code".', (code, actor) =>
            roomManager.openGameSelector(code, actor)
          );
          return;
        }

        case 'set_game_select_mode': {
          const mode = payload.mode;
          if (mode !== 'CHOOSE' && mode !== 'VOTE') {
            sendError(ws, 'BAD_PAYLOAD', 'set_game_select_mode requires mode "CHOOSE" or "VOTE".');
            return;
          }
          withActorCode(ws, payload, 'set_game_select_mode requires "code".', (code, actor) =>
            roomManager.setGameSelectMode(code, actor, mode)
          );
          return;
        }

        case 'start_random_game': {
          withActorCode(ws, payload, 'start_random_game requires "code".', (code, actor) =>
            roomManager.startRandomGame(code, actor)
          );
          return;
        }

        case 'stop_randomized': {
          withActorCode(ws, payload, 'stop_randomized requires "code".', (code, actor) =>
            roomManager.stopRandomized(code, actor)
          );
          return;
        }

        case 'vote_game': {
          const gameId = asString(payload.gameId);
          if (!gameId) {
            sendError(ws, 'BAD_PAYLOAD', 'vote_game requires string "code" and "gameId".');
            return;
          }
          withActorCode(ws, payload, 'vote_game requires string "code" and "gameId".', (code, actor) =>
            roomManager.voteGame(code, actor, gameId)
          );
          return;
        }

        case 'start_game': {
          withActorCode(ws, payload, 'start_game requires "code".', (code, actor) =>
            roomManager.startGame(code, actor, {
              gameId: asString(payload.gameId),
              config: isRecord(payload.config) ? payload.config : undefined,
            })
          );
          return;
        }

        case 'game_action': {
          const action = payload.action;
          if (!isRecord(action) || typeof action.type !== 'string') {
            sendError(ws, 'BAD_PAYLOAD', 'game_action requires "code" and an "action" with a string "type".');
            return;
          }
          withActorCode(
            ws,
            payload,
            'game_action requires "code" and an "action" with a string "type".',
            (code, actor) =>
              roomManager.handleAction(
                code,
                actor,
                { type: action.type as string, payload: action.payload },
                asString(payload.roundId)
              )
          );
          return;
        }

        case 'end_game': {
          withActorCode(ws, payload, 'end_game requires "code".', (code, actor) =>
            roomManager.endGame(code, actor)
          );
          return;
        }

        case 'return_to_lobby': {
          withActorCode(ws, payload, 'return_to_lobby requires "code".', (code, actor) =>
            roomManager.returnToLobby(code, actor)
          );
          return;
        }
      }
    },
    close(ws) {
      const { roomCode, role, playerId } = ws.data;
      if (!roomCode) return;

      if (role === 'host') {
        const set = hostSockets.get(roomCode);
        if (set) {
          set.delete(ws);
          if (set.size === 0) {
            hostSockets.delete(roomCode);
          }
        }
      } else if (role === 'player' && playerId) {
        if (unregisterPlayerSocket(roomCode, playerId, ws)) {
          roomManager.markPlayerDisconnected(roomCode, playerId);
        }
      }
    },
  },
});

console.log(`Party foundation server listening on http://${HOST}:${server.port}`);
