import type { GameAction, GameInfo } from '../shared/protocol';

export interface GamePlayer {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  meta: Record<string, unknown>;
}

export interface GameContext {
  roomCode: string;
  getPlayers(): GamePlayer[];
  getPlayer(playerId: string): GamePlayer | undefined;
  setPlayerScore(playerId: string, score: number): void;
  addPlayerScore(playerId: string, delta: number): void;
  setPlayerMeta(playerId: string, meta: Record<string, unknown>): void;
  setTimer(durationMs: number): void;
  clearTimer(): void;
  broadcastEvent(event: string, payload?: unknown): void;
  sendEventToHost(event: string, payload?: unknown): void;
  sendEventToPlayer(playerId: string, event: string, payload?: unknown): void;
  emitWebhook(event: string, data: unknown): void;
  endGame(): void;
}

/**
 * Contract for any arbitrary TV + Phone game built on top of the party foundation.
 */
export interface GameDefinition<
  TState = unknown,
  THostView = unknown,
  TPlayerView = unknown,
  TAction extends GameAction = GameAction,
> {
  id: string;
  name: string;
  description?: string;
  minPlayers?: number;
  maxPlayers?: number;

  onStart(ctx: GameContext, config?: Record<string, unknown>): TState;
  onPlayerAction(
    ctx: GameContext,
    state: TState,
    playerId: string,
    action: TAction
  ): TState | void;
  onHostAction?(ctx: GameContext, state: TState, action: TAction): TState | void;
  onTimerExpired?(ctx: GameContext, state: TState): TState | void;
  onPlayerJoin?(ctx: GameContext, state: TState, playerId: string): TState | void;
  onPlayerReconnect?(ctx: GameContext, state: TState, playerId: string): TState | void;
  onPlayerDisconnect?(ctx: GameContext, state: TState, playerId: string): TState | void;
  onPlayerLeave?(ctx: GameContext, state: TState, playerId: string): TState | void;
  onExternalEvent?(
    ctx: GameContext,
    state: TState,
    event: string,
    payload: unknown
  ): TState | void;
  onEnd?(ctx: GameContext, state: TState): void;

  getHostView(state: TState, ctx: GameContext): THostView;
  getPlayerView(state: TState, playerId: string, ctx: GameContext): TPlayerView;
}

export class GameRegistry {
  private games = new Map<string, GameDefinition<any, any, any, any>>();

  register<TState, THostView, TPlayerView, TAction extends GameAction>(
    game: GameDefinition<TState, THostView, TPlayerView, TAction>
  ): void {
    this.games.set(game.id, game);
  }

  get(id: string): GameDefinition<any, any, any, any> | undefined {
    return this.games.get(id);
  }

  list(): GameInfo[] {
    return Array.from(this.games.values()).map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      minPlayers: g.minPlayers ?? 1,
      maxPlayers: g.maxPlayers ?? 12,
    }));
  }

  defaultGameId(): string | null {
    const first = this.games.keys().next();
    return first.done ? null : first.value;
  }
}
