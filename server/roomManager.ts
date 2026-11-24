import type {
  GameAction,
  GameSelectMode,
  PlayerSummary,
  RoomPhase,
  RoomState,
} from '../shared/protocol';
import {
  GameRegistry,
  type GameContext,
  type GameDefinition,
  type GamePlayer,
} from './game';
import { createGameRegistry } from './games';
import { WebhookManager } from './webhooks';

export interface RoomBroadcaster {
  sendToHost(roomCode: string, message: unknown): void;
  sendToPlayer(roomCode: string, playerId: string, message: unknown): void;
  broadcastAll(roomCode: string, message: unknown): void;
  onRoomDisposed?(roomCode: string): void;
}

export interface InternalRoom {
  code: string;
  hostToken: string;
  phase: RoomPhase;
  gameId: string | null;
  gameState: unknown;
  roundId: string;
  stateVersion: number;
  phaseEndsAt: number | null;
  lastActivityAt: number;
  players: Map<string, GamePlayer>;
  seats: Map<string, number>;
  gameSelectMode: GameSelectMode;
  randomizedMode: boolean;
  gameVotes: Map<string, string>;
  phaseTimer?: ReturnType<typeof setTimeout>;
  tickInterval?: ReturnType<typeof setInterval>;
}

export interface RoomManagerOptions {
  minPlayers?: number;
  maxPlayers?: number;
  enableTickInterval?: boolean;
  roomTtlMs?: number;
  cleanupIntervalMs?: number;
  registry?: GameRegistry;
  webhooks?: WebhookManager;
  randomizedNextDelayMs?: number;
}

export type ActionResult<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message: string };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export class RoomManager {
  private rooms = new Map<string, InternalRoom>();
  private readonly defaultMinPlayers: number;
  private readonly defaultMaxPlayers: number;
  private readonly enableTickInterval: boolean;
  private readonly roomTtlMs: number;
  private readonly randomizedNextDelayMs: number;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  readonly registry: GameRegistry;
  readonly webhooks: WebhookManager;

  constructor(
    private broadcaster: RoomBroadcaster,
    options: RoomManagerOptions = {}
  ) {
    this.defaultMinPlayers = options.minPlayers ?? 1;
    this.defaultMaxPlayers = options.maxPlayers ?? 12;
    this.enableTickInterval = options.enableTickInterval ?? true;
    this.roomTtlMs = options.roomTtlMs ?? 4 * 60 * 60 * 1000;
    this.randomizedNextDelayMs = options.randomizedNextDelayMs ?? 8_000;
    this.webhooks = options.webhooks ?? new WebhookManager();

    if (options.registry) {
      this.registry = options.registry;
    } else {
      this.registry = createGameRegistry();
    }

    if (this.roomTtlMs > 0) {
      const intervalMs = options.cleanupIntervalMs ?? 15 * 60 * 1000;
      this.cleanupTimer = setInterval(() => {
        this.pruneIdleRooms();
      }, intervalMs);
      this.cleanupTimer.unref?.();
    }
  }

  createRoom(
    existingHostToken?: string,
    preferredGameId?: string
  ): { room: InternalRoom; hostToken: string; reused: boolean } {
    if (existingHostToken) {
      for (const room of this.rooms.values()) {
        if (room.hostToken === existingHostToken) {
          room.lastActivityAt = Date.now();
          return { room, hostToken: existingHostToken, reused: true };
        }
      }
    }

    const code = this.generateRoomCode();
    const hostToken = crypto.randomUUID();
    const gameId =
      preferredGameId && this.registry.get(preferredGameId)
        ? preferredGameId
        : this.registry.defaultGameId();

    const room: InternalRoom = {
      code,
      hostToken,
      phase: 'LOBBY',
      gameId,
      gameState: null,
      roundId: crypto.randomUUID(),
      stateVersion: 1,
      phaseEndsAt: null,
      lastActivityAt: Date.now(),
      players: new Map(),
      seats: new Map(),
      gameSelectMode: 'CHOOSE',
      randomizedMode: false,
      gameVotes: new Map(),
    };

    this.rooms.set(code, room);
    this.emitWebhook('room.created', code, { gameId });
    return { room, hostToken, reused: false };
  }

  getRoom(code: string): InternalRoom | undefined {
    return this.rooms.get(code.trim().toUpperCase());
  }

  isValidHostToken(code: string, token: string | null | undefined): boolean {
    if (!token) return false;
    const room = this.getRoom(code);
    return Boolean(room && room.hostToken === token);
  }

  joinRoom(
    rawCode: string,
    rawName: string,
    existingPlayerId?: string
  ): ActionResult<{ room: InternalRoom; player: GamePlayer }> {
    const code = rawCode.trim().toUpperCase();
    const name = rawName.trim().slice(0, 16);

    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: `Room "${code}" was not found.` };
    }

    if (!name) {
      return { ok: false, code: 'INVALID_NAME', message: 'Please enter a player name.' };
    }

    if (existingPlayerId && room.players.has(existingPlayerId)) {
      const existing = room.players.get(existingPlayerId)!;
      existing.name = name;
      this.handlePlayerReconnect(room, existing);
      return { ok: true, room, player: existing };
    }

    const { maxPlayers } = this.getLimits(room);
    if (room.players.size >= maxPlayers) {
      return {
        ok: false,
        code: 'ROOM_FULL',
        message: `Room is full (max ${maxPlayers} players).`,
      };
    }

    const duplicate = Array.from(room.players.values()).some(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      return {
        ok: false,
        code: 'NAME_TAKEN',
        message: `The name "${name}" is already taken in this room.`,
      };
    }

    const playerId = existingPlayerId || crypto.randomUUID();
    const player: GamePlayer = {
      id: playerId,
      name,
      score: 0,
      totalScore: 0,
      connected: true,
      meta: {},
    };

    room.players.set(playerId, player);
    room.seats.set(playerId, this.nextFreeSeat(room));
    room.lastActivityAt = Date.now();

    if (room.phase === 'PLAYING') {
      this.invokeGameHook(room, (game, ctx) =>
        game.onPlayerJoin?.(ctx, room.gameState, playerId)
      );
    }

    this.broadcastState(room);
    this.emitWebhook('player.joined', room.code, {
      playerId: player.id,
      name: player.name,
    });
    return { ok: true, room, player };
  }

  reconnectPlayer(
    rawCode: string,
    playerId: string
  ): ActionResult<{ room: InternalRoom; player: GamePlayer }> {
    const code = rawCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: `Room "${code}" no longer exists.` };
    }
    const player = room.players.get(playerId);
    if (!player) {
      return { ok: false, code: 'PLAYER_NOT_FOUND', message: 'Session expired. Please rejoin the room.' };
    }

    this.handlePlayerReconnect(room, player);
    return { ok: true, room, player };
  }

  leaveRoom(rawCode: string, playerId: string): ActionResult {
    const room = this.getRoom(rawCode);
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found.' };
    }
    const player = room.players.get(playerId);
    if (!player) {
      return { ok: false, code: 'PLAYER_NOT_FOUND', message: 'Player not found.' };
    }

    if (room.phase === 'PLAYING') {
      this.invokeGameHook(room, (game, ctx) =>
        game.onPlayerLeave?.(ctx, room.gameState, playerId)
      );
    }

    room.lastActivityAt = Date.now();
    room.players.delete(playerId);
    room.seats.delete(playerId);
    room.gameVotes.delete(playerId);

    this.finishPlayerDeparture(room, 'player.left', player);
    return { ok: true };
  }

  markPlayerDisconnected(code: string, playerId: string): void {
    const room = this.getRoom(code);
    if (!room) return;
    const player = room.players.get(playerId);
    if (!player) return;

    player.connected = false;
    if (room.phase === 'PLAYING') {
      this.invokeGameHook(room, (game, ctx) =>
        game.onPlayerDisconnect?.(ctx, room.gameState, playerId)
      );
    }

    this.finishPlayerDeparture(room, 'player.disconnected', player);
  }

  openGameSelector(
    rawCode: string,
    actor: { playerId?: string; hostToken?: string }
  ): ActionResult<{ room: InternalRoom }> {
    const auth = this.requireAuthorizedRoom(
      rawCode,
      actor,
      'Only a room player or TV host can open the game selector.'
    );
    if (!auth.ok) return auth;
    const { room } = auth;

    if (room.phase === 'PLAYING') {
      return {
        ok: false,
        code: 'INVALID_PHASE',
        message: 'Cannot open game selector while a game is in progress.',
      };
    }

    room.randomizedMode = false;
    this.resetRoomPhase(room, 'GAME_SELECT');

    this.broadcastState(room);
    return { ok: true, room };
  }

  setGameSelectMode(
    rawCode: string,
    actor: { playerId?: string; hostToken?: string },
    mode: GameSelectMode
  ): ActionResult<{ room: InternalRoom }> {
    const auth = this.requireAuthorizedRoom(
      rawCode,
      actor,
      'Only a room player or TV host can change the game selector mode.'
    );
    if (!auth.ok) return auth;
    const { room } = auth;

    if (room.phase !== 'GAME_SELECT') {
      return {
        ok: false,
        code: 'INVALID_PHASE',
        message: 'Game selector mode can only be changed in the game selector.',
      };
    }

    room.lastActivityAt = Date.now();
    room.gameSelectMode = mode;
    this.broadcastState(room);
    return { ok: true, room };
  }

  startRandomGame(
    rawCode: string,
    actor: { playerId?: string; hostToken?: string }
  ): ActionResult<{ room: InternalRoom }> {
    const auth = this.requireAuthorizedRoom(
      rawCode,
      actor,
      'Only a room player or TV host can start a random game.'
    );
    if (!auth.ok) return auth;
    const { room } = auth;

    if (room.phase !== 'LOBBY' && room.phase !== 'GAME_SELECT' && room.phase !== 'ENDED') {
      return { ok: false, code: 'INVALID_PHASE', message: 'Game has already started.' };
    }

    const game = this.pickRandomEligibleGame(room);
    if (!game) {
      return {
        ok: false,
        code: 'NO_GAME',
        message: 'No eligible game found for the current player count.',
      };
    }

    room.randomizedMode = true;
    this.launchGame(room, game);
    return { ok: true, room };
  }

  stopRandomized(
    rawCode: string,
    actor: { playerId?: string; hostToken?: string }
  ): ActionResult<{ room: InternalRoom }> {
    const auth = this.requireAuthorizedRoom(
      rawCode,
      actor,
      'Only a room player or TV host can stop randomized mode.'
    );
    if (!auth.ok) return auth;
    const { room } = auth;

    room.randomizedMode = false;
    if (room.phase === 'ENDED') {
      this.clearTimers(room);
      room.phaseEndsAt = null;
    }
    room.lastActivityAt = Date.now();
    this.broadcastState(room);
    return { ok: true, room };
  }

  voteGame(
    rawCode: string,
    actor: { playerId?: string },
    gameId: string
  ): ActionResult<{ room: InternalRoom; started: boolean }> {
    const room = this.getRoom(rawCode);
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found.' };
    }
    if (room.phase !== 'GAME_SELECT') {
      return {
        ok: false,
        code: 'INVALID_PHASE',
        message: 'Game voting is only available in the game selector.',
      };
    }
    if (!actor.playerId || !room.players.has(actor.playerId)) {
      return { ok: false, code: 'PLAYER_NOT_FOUND', message: 'Player not found in room.' };
    }

    const game = this.registry.get(gameId);
    if (!game) {
      return { ok: false, code: 'NO_GAME', message: 'Selected game was not found.' };
    }
    const minPlayers = game.minPlayers ?? this.defaultMinPlayers;
    if (room.players.size < minPlayers) {
      return {
        ok: false,
        code: 'NOT_ENOUGH_PLAYERS',
        message: `Need at least ${minPlayers} player(s) to start.`,
      };
    }

    room.lastActivityAt = Date.now();
    room.gameVotes.set(actor.playerId, gameId);

    if (this.maybeResolveGameVote(room)) {
      return { ok: true, room, started: true };
    }

    this.broadcastState(room);
    return { ok: true, room, started: false };
  }

  startGame(
    rawCode: string,
    actor: { playerId?: string; hostToken?: string },
    options?: { gameId?: string; config?: Record<string, unknown> }
  ): ActionResult<{ room: InternalRoom }> {
    const auth = this.requireAuthorizedRoom(
      rawCode,
      actor,
      'Only a room player or TV host can start the game.'
    );
    if (!auth.ok) return auth;
    const { room } = auth;

    if (room.phase !== 'LOBBY' && room.phase !== 'GAME_SELECT') {
      return { ok: false, code: 'INVALID_PHASE', message: 'Game has already started.' };
    }

    const targetGameId = options?.gameId ?? room.gameId ?? this.registry.defaultGameId();
    const game = targetGameId ? this.registry.get(targetGameId) : undefined;
    if (!game) {
      return { ok: false, code: 'NO_GAME', message: 'No game is registered or selected.' };
    }

    const minPlayers = game.minPlayers ?? this.defaultMinPlayers;
    if (room.players.size < minPlayers) {
      return {
        ok: false,
        code: 'NOT_ENOUGH_PLAYERS',
        message: `Need at least ${minPlayers} player(s) to start.`,
      };
    }

    room.randomizedMode = false;
    this.launchGame(room, game, options?.config);
    return { ok: true, room };
  }

  private launchGame(
    room: InternalRoom,
    game: GameDefinition<any, any, any, any>,
    config?: Record<string, unknown>
  ): void {
    this.clearTimers(room);
    room.gameVotes.clear();
    this.resetPlayers(room);

    room.lastActivityAt = Date.now();
    room.gameId = game.id;
    room.phase = 'PLAYING';
    room.roundId = crypto.randomUUID();
    room.phaseEndsAt = null;

    const ctx = this.createGameContext(room);
    room.gameState = game.onStart(ctx, config);

    this.broadcastState(room);
    this.emitWebhook('game.started', room.code, {
      gameId: game.id,
      playerCount: room.players.size,
      config,
    });
  }

  private maybeResolveGameVote(room: InternalRoom): boolean {
    const connectedPlayers = Array.from(room.players.values()).filter((p) => p.connected);
    if (connectedPlayers.length === 0) return false;
    if (!connectedPlayers.every((p) => room.gameVotes.has(p.id))) {
      return false;
    }

    const counts = new Map<string, number>();
    for (const player of connectedPlayers) {
      const votedGameId = room.gameVotes.get(player.id);
      if (!votedGameId) continue;
      const game = this.registry.get(votedGameId);
      if (!game) continue;
      const minPlayers = game.minPlayers ?? this.defaultMinPlayers;
      if (room.players.size < minPlayers) continue;
      counts.set(votedGameId, (counts.get(votedGameId) ?? 0) + 1);
    }

    if (counts.size === 0) return false;

    let maxVotes = 0;
    let leaders: string[] = [];
    for (const [gameId, count] of counts.entries()) {
      if (count > maxVotes) {
        maxVotes = count;
        leaders = [gameId];
      } else if (count === maxVotes) {
        leaders.push(gameId);
      }
    }

    const winnerId = leaders[Math.floor(Math.random() * leaders.length)];
    const winnerGame = this.registry.get(winnerId);
    if (!winnerGame) return false;

    room.randomizedMode = false;
    this.launchGame(room, winnerGame);
    return true;
  }

  handleAction(
    rawCode: string,
    actor: { playerId?: string; hostToken?: string },
    action: GameAction,
    expectedRoundId?: string
  ): ActionResult {
    const room = this.getRoom(rawCode);
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found.' };
    }
    if (room.phase !== 'PLAYING') {
      return { ok: false, code: 'INVALID_PHASE', message: 'No active game in progress.' };
    }
    if (expectedRoundId && room.roundId !== expectedRoundId) {
      return { ok: false, code: 'STALE_ROUND', message: 'That round has already ended.' };
    }

    const game = this.getActiveGame(room);
    if (!game) {
      return { ok: false, code: 'NO_GAME', message: 'Active game definition not found.' };
    }

    const isHost = Boolean(actor.hostToken && actor.hostToken === room.hostToken);
    if (isHost) {
      if (!game.onHostAction) {
        return { ok: false, code: 'UNSUPPORTED_ACTION', message: 'Host actions are not supported by this game.' };
      }
      room.lastActivityAt = Date.now();
      const ctx = this.createGameContext(room);
      const nextState = game.onHostAction(ctx, room.gameState, action);
      if (nextState !== undefined) {
        room.gameState = nextState;
      }
      this.broadcastState(room);
      this.emitWebhook('game.action', room.code, {
        actor: 'host',
        gameId: game.id,
        action,
      });
      return { ok: true };
    }

    if (!actor.playerId || !room.players.has(actor.playerId)) {
      return { ok: false, code: 'PLAYER_NOT_FOUND', message: 'Player not found in room.' };
    }

    room.lastActivityAt = Date.now();
    const ctx = this.createGameContext(room);
    const nextState = game.onPlayerAction(ctx, room.gameState, actor.playerId, action);
    if (nextState !== undefined) {
      room.gameState = nextState;
    }

    this.broadcastState(room);
    this.emitWebhook('game.action', room.code, {
      actor: 'player',
      playerId: actor.playerId,
      gameId: game.id,
      action,
    });
    return { ok: true };
  }

  handleExternalEvent(
    rawCode: string,
    event: string,
    payload?: unknown
  ): ActionResult {
    const room = this.getRoom(rawCode);
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found.' };
    }

    room.lastActivityAt = Date.now();
    if (room.phase === 'PLAYING') {
      const game = this.getActiveGame(room);
      if (game?.onExternalEvent) {
        const ctx = this.createGameContext(room);
        const nextState = game.onExternalEvent(ctx, room.gameState, event, payload);
        if (nextState !== undefined) {
          room.gameState = nextState;
        }
        this.broadcastState(room);
        return { ok: true };
      }
    }

    this.broadcaster.broadcastAll(room.code, {
      type: 'game_event',
      payload: { event, payload },
    });
    return { ok: true };
  }

  endGame(
    rawCode: string,
    actor: { playerId?: string; hostToken?: string }
  ): ActionResult {
    const auth = this.requireAuthorizedRoom(
      rawCode,
      actor,
      'Only a room player or TV host can end the game.'
    );
    if (!auth.ok) return auth;
    const { room } = auth;

    if (room.phase !== 'PLAYING') {
      return { ok: true };
    }

    room.lastActivityAt = Date.now();
    this.transitionToEnded(room);
    return { ok: true };
  }

  abortGame(
    rawCode: string,
    actor: { playerId?: string; hostToken?: string }
  ): ActionResult<{ room: InternalRoom }> {
    const room = this.getRoom(rawCode);
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found.' };
    }
    if (!actor.hostToken || actor.hostToken !== room.hostToken) {
      return {
        ok: false,
        code: 'UNAUTHORIZED',
        message: 'Only the TV host can abort the active game.',
      };
    }

    if (room.phase === 'PLAYING') {
      const game = this.getActiveGame(room);
      if (game?.onEnd && room.gameState !== null) {
        game.onEnd(this.createGameContext(room), room.gameState);
      }
      for (const p of room.players.values()) {
        p.totalScore -= p.score;
        p.score = 0;
        p.meta = {};
      }
    }

    room.randomizedMode = false;
    this.resetRoomPhase(room, 'GAME_SELECT');
    this.broadcastState(room);
    return { ok: true, room };
  }

  returnToLobby(
    rawCode: string,
    actor: { playerId?: string; hostToken?: string }
  ): ActionResult {
    const auth = this.requireAuthorizedRoom(
      rawCode,
      actor,
      'Only a room player or TV host can return to lobby.'
    );
    if (!auth.ok) return auth;
    const { room } = auth;

    room.randomizedMode = false;
    this.resetRoomPhase(room, 'LOBBY');
    this.resetPlayers(room);

    this.broadcastState(room);
    this.emitWebhook('room.lobby', room.code, { gameId: room.gameId });
    return { ok: true };
  }

  private resetPlayers(room: InternalRoom): void {
    for (const p of room.players.values()) {
      p.score = 0;
      p.meta = {};
    }
  }

  private finishPlayerDeparture(
    room: InternalRoom,
    event: 'player.left' | 'player.disconnected',
    player: GamePlayer
  ): void {
    if (room.phase !== 'GAME_SELECT' || !this.maybeResolveGameVote(room)) {
      this.broadcastState(room);
    }
    this.emitWebhook(event, room.code, { playerId: player.id, name: player.name });
  }

  private nextFreeSeat(room: InternalRoom): number {
    const taken = new Set(room.seats.values());
    let seat = 0;
    while (taken.has(seat)) seat++;
    return seat;
  }

  buildStateForClient(room: InternalRoom, playerId?: string): RoomState {
    const players: PlayerSummary[] = Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      totalScore: p.totalScore,
      connected: p.connected,
      seat: room.seats.get(p.id) ?? 0,
      meta: p.meta,
    }));

    const { minPlayers, maxPlayers } = this.getLimits(room);
    const game = this.getActiveGame(room);

    let hostState: unknown = undefined;
    let playerState: unknown = undefined;

    if (game && room.gameState !== null && (room.phase === 'PLAYING' || room.phase === 'ENDED')) {
      const ctx = this.createGameContext(room);
      if (playerId) {
        playerState = game.getPlayerView(room.gameState, playerId, ctx);
      } else {
        hostState = game.getHostView(room.gameState, ctx);
      }
    }

    return {
      code: room.code,
      phase: room.phase,
      gameId: room.gameId,
      roundId: room.roundId,
      stateVersion: room.stateVersion,
      phaseEndsAt: room.phaseEndsAt,
      players,
      minPlayers,
      maxPlayers,
      games: this.registry.list(),
      gameSelectMode: room.phase === 'GAME_SELECT' ? room.gameSelectMode : undefined,
      randomizedMode: room.randomizedMode || undefined,
      gameVotes:
        room.phase === 'GAME_SELECT' ? Object.fromEntries(room.gameVotes) : undefined,
      hostState,
      playerState,
    };
  }

  disposeRoom(code: string): void {
    const room = this.getRoom(code);
    if (!room) return;
    this.clearTimers(room);
    this.rooms.delete(room.code);
    this.broadcaster.onRoomDisposed?.(room.code);
    this.emitWebhook('room.disposed', room.code, {});
  }

  pruneIdleRooms(now = Date.now()): number {
    if (this.roomTtlMs <= 0) return 0;
    let disposed = 0;
    for (const room of Array.from(this.rooms.values())) {
      if (now - room.lastActivityAt >= this.roomTtlMs) {
        this.disposeRoom(room.code);
        disposed += 1;
      }
    }
    return disposed;
  }

  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    for (const room of Array.from(this.rooms.values())) {
      this.clearTimers(room);
    }
    this.rooms.clear();
  }

  private resetRoomPhase(room: InternalRoom, phase: RoomPhase): void {
    this.clearTimers(room);
    room.lastActivityAt = Date.now();
    room.phase = phase;
    room.roundId = crypto.randomUUID();
    room.phaseEndsAt = null;
    room.gameState = null;
    room.gameSelectMode = 'CHOOSE';
    room.gameVotes.clear();
  }

  private requireAuthorizedRoom(
    rawCode: string,
    actor: { playerId?: string; hostToken?: string },
    unauthorizedMessage: string
  ): ActionResult<{ room: InternalRoom }> {
    const room = this.getRoom(rawCode);
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found.' };
    }
    if (!this.isAuthorizedController(room, actor)) {
      return { ok: false, code: 'UNAUTHORIZED', message: unauthorizedMessage };
    }
    return { ok: true, room };
  }

  private handlePlayerReconnect(room: InternalRoom, player: GamePlayer): void {
    player.connected = true;
    room.lastActivityAt = Date.now();
    if (room.phase === 'PLAYING') {
      this.invokeGameHook(room, (game, ctx) =>
        game.onPlayerReconnect?.(ctx, room.gameState, player.id)
      );
    }
    this.broadcastState(room);
    this.emitWebhook('player.reconnected', room.code, {
      playerId: player.id,
      name: player.name,
    });
  }

  private transitionToEnded(room: InternalRoom): void {
    this.clearTimers(room);
    const game = this.getActiveGame(room);
    if (game?.onEnd && room.gameState !== null) {
      game.onEnd(this.createGameContext(room), room.gameState);
    }

    room.phase = 'ENDED';
    room.roundId = crypto.randomUUID();
    room.phaseEndsAt = null;
    if (room.randomizedMode) {
      room.phaseEndsAt = Date.now() + this.randomizedNextDelayMs;
      this.scheduleRandomizedNextTimer(room, this.randomizedNextDelayMs);
    }
    this.broadcastState(room);

    const standings = Array.from(room.players.values())
      .map((p) => ({ id: p.id, name: p.name, score: p.score, totalScore: p.totalScore }))
      .sort((a, b) => b.score - a.score);

    this.emitWebhook('game.ended', room.code, {
      gameId: room.gameId,
      standings,
    });
  }

  private getActiveGame(room: InternalRoom): GameDefinition<any, any, any, any> | undefined {
    return room.gameId ? this.registry.get(room.gameId) : undefined;
  }

  private getLimits(room: InternalRoom): { minPlayers: number; maxPlayers: number } {
    const game = this.getActiveGame(room);
    return {
      minPlayers: game?.minPlayers ?? this.defaultMinPlayers,
      maxPlayers: game?.maxPlayers ?? this.defaultMaxPlayers,
    };
  }

  private invokeGameHook(
    room: InternalRoom,
    fn: (game: GameDefinition<any, any, any, any>, ctx: GameContext) => unknown
  ): void {
    const game = this.getActiveGame(room);
    if (!game || room.gameState === null) return;
    const next = fn(game, this.createGameContext(room));
    if (next !== undefined) {
      room.gameState = next;
    }
  }

  private createGameContext(room: InternalRoom): GameContext {
    const boundRoundId = room.roundId;
    return {
      roomCode: room.code,
      getPlayers: () => Array.from(room.players.values()),
      getPlayer: (playerId) => room.players.get(playerId),
      setPlayerScore: (playerId, score) => {
        const p = room.players.get(playerId);
        if (p) {
          const prev = p.score;
          p.score = score;
          p.totalScore += score - prev;
        }
      },
      addPlayerScore: (playerId, delta) => {
        const p = room.players.get(playerId);
        if (p) {
          p.score += delta;
          p.totalScore += delta;
        }
      },
      setPlayerMeta: (playerId, meta) => {
        const p = room.players.get(playerId);
        if (p) p.meta = { ...p.meta, ...meta };
      },
      setTimer: (durationMs, showCountdown = true) => {
        if (showCountdown) {
          this.clearTimers(room);
          room.phaseEndsAt = Date.now() + durationMs;
          this.scheduleTimer(room, durationMs, true);
        } else {
          if (room.phaseTimer) {
            clearTimeout(room.phaseTimer);
            room.phaseTimer = undefined;
          }
          this.scheduleTimer(room, durationMs, false);
        }
      },
      clearTimer: () => {
        this.clearTimers(room);
        room.phaseEndsAt = null;
      },
      dispatch: (fn) => {
        if (room.phase !== 'PLAYING' || room.roundId !== boundRoundId || room.gameState === null) {
          return;
        }
        const next = (fn as (state: unknown) => unknown)(room.gameState);
        if (next !== undefined) {
          room.gameState = next;
        }
        if (room.phase === 'PLAYING') {
          this.broadcastState(room);
        }
      },
      broadcastEvent: (event, payload) => {
        this.broadcaster.broadcastAll(room.code, {
          type: 'game_event',
          payload: { event, payload },
        });
      },
      sendEventToHost: (event, payload) => {
        this.broadcaster.sendToHost(room.code, {
          type: 'game_event',
          payload: { event, payload },
        });
      },
      sendEventToPlayer: (playerId, event, payload) => {
        this.broadcaster.sendToPlayer(room.code, playerId, {
          type: 'game_event',
          payload: { event, payload },
        });
      },
      emitWebhook: (event, data) => {
        this.emitWebhook(event, room.code, data);
      },
      endGame: () => {
        if (room.phase === 'PLAYING') {
          this.transitionToEnded(room);
        }
      },
    };
  }

  private isAuthorizedController(
    room: InternalRoom,
    actor: { playerId?: string; hostToken?: string }
  ): boolean {
    if (actor.hostToken && actor.hostToken === room.hostToken) {
      return true;
    }
    if (actor.playerId && room.players.has(actor.playerId)) {
      return true;
    }
    return false;
  }

  private broadcastState(room: InternalRoom): void {
    room.stateVersion += 1;

    this.broadcaster.sendToHost(room.code, {
      type: 'room_state',
      payload: this.buildStateForClient(room),
    });

    for (const playerId of room.players.keys()) {
      this.broadcaster.sendToPlayer(room.code, playerId, {
        type: 'room_state',
        payload: this.buildStateForClient(room, playerId),
      });
    }
  }

  private pickRandomEligibleGame(
    room: InternalRoom
  ): GameDefinition<any, any, any, any> | undefined {
    const eligible = this.registry.list().filter((info) => {
      const min = info.minPlayers ?? this.defaultMinPlayers;
      const max = info.maxPlayers ?? this.defaultMaxPlayers;
      return room.players.size >= min && room.players.size <= max;
    });
    if (eligible.length === 0) return undefined;

    const nonRepeating =
      room.gameId && eligible.length > 1
        ? eligible.filter((info) => info.id !== room.gameId)
        : eligible;
    const pool = nonRepeating.length > 0 ? nonRepeating : eligible;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    return this.registry.get(chosen.id);
  }

  private scheduleRandomizedNextTimer(room: InternalRoom, durationMs: number): void {
    room.phaseTimer = setTimeout(() => {
      room.phaseEndsAt = null;
      this.clearTimers(room);
      if (room.phase !== 'ENDED' || !room.randomizedMode) return;

      const nextGame = this.pickRandomEligibleGame(room);
      if (!nextGame) {
        room.randomizedMode = false;
        this.broadcastState(room);
        return;
      }

      this.launchGame(room, nextGame);
    }, durationMs);

    this.startTickInterval(room);
  }

  private scheduleTimer(room: InternalRoom, durationMs: number, showCountdown = true): void {
    room.phaseTimer = setTimeout(() => {
      if (showCountdown) {
        room.phaseEndsAt = null;
        this.clearTimers(room);
      } else {
        room.phaseTimer = undefined;
      }
      if (room.phase !== 'PLAYING') return;

      this.invokeGameHook(room, (game, ctx) =>
        game.onTimerExpired?.(ctx, room.gameState)
      );
      if (room.phase === 'PLAYING') {
        this.broadcastState(room);
      }
    }, durationMs);

    if (showCountdown) {
      this.startTickInterval(room);
    }
  }

  private startTickInterval(room: InternalRoom): void {
    if (!this.enableTickInterval) return;
    room.tickInterval = setInterval(() => {
      if (room.phaseEndsAt === null) return;
      const remainingMs = Math.max(0, room.phaseEndsAt - Date.now());
      this.broadcaster.broadcastAll(room.code, {
        type: 'tick',
        payload: { remainingMs, phaseEndsAt: room.phaseEndsAt },
      });
    }, 1000);
  }

  private clearTimers(room: InternalRoom): void {
    if (room.phaseTimer) {
      clearTimeout(room.phaseTimer);
      room.phaseTimer = undefined;
    }
    if (room.tickInterval) {
      clearInterval(room.tickInterval);
      room.tickInterval = undefined;
    }
  }

  private emitWebhook(event: string, roomCode: string, data: unknown): void {
    void this.webhooks.emit(event, roomCode, data);
  }

  private generateRoomCode(): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) {
        return code;
      }
    }
    throw new Error('Unable to generate unique room code');
  }
}
