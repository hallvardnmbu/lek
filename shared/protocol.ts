export type RoomPhase = 'LOBBY' | 'GAME_SELECT' | 'PLAYING' | 'ENDED';

export type RoomCode = string;

export interface PlayerSummary {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  meta?: Record<string, unknown>;
}

export interface GameAction<TType extends string = string, TPayload = unknown> {
  type: TType;
  payload?: TPayload;
}

export interface RoomState<THostState = unknown, TPlayerState = unknown> {
  code: string;
  phase: RoomPhase;
  gameId: string | null;
  roundId: string;
  stateVersion: number;
  phaseEndsAt: number | null;
  players: PlayerSummary[];
  minPlayers: number;
  maxPlayers: number;
  /** Registered games available in the game selector */
  games: GameInfo[];
  /** Player votes (playerId -> gameId) during GAME_SELECT */
  gameVotes?: Record<string, string>;
  /** Game-specific state visible to the TV host */
  hostState?: THostState;
  /** Game-specific state projected for an individual phone player */
  playerState?: TPlayerState;
}

export interface GameInfo {
  id: string;
  name: string;
  description?: string;
  minPlayers: number;
  maxPlayers: number;
}

export type WebhookEventType =
  | 'room.created'
  | 'room.disposed'
  | 'player.joined'
  | 'player.reconnected'
  | 'player.disconnected'
  | 'player.left'
  | 'game.selected'
  | 'game.started'
  | 'game.action'
  | 'game.ended'
  | 'room.lobby'
  | 'custom';

export interface WebhookPayload<T = unknown> {
  id: string;
  event: WebhookEventType | string;
  timestamp: string;
  roomCode: string;
  data: T;
}

// Client -> Server messages
export type ClientMessage =
  | {
      type: 'create_room';
      payload: { hostToken?: string; gameId?: string };
    }
  | {
      type: 'join_room';
      payload: { code: string; name: string; playerId?: string };
    }
  | {
      type: 'reconnect';
      payload: { code: string; playerId: string };
    }
  | {
      type: 'leave_room';
      payload: { code: string; playerId: string };
    }
  | {
      type: 'open_game_selector';
      payload: { code: string; playerId?: string; hostToken?: string };
    }
  | {
      type: 'vote_game';
      payload: { code: string; playerId?: string; gameId: string };
    }
  | {
      type: 'start_game';
      payload: {
        code: string;
        playerId?: string;
        hostToken?: string;
        gameId?: string;
        config?: Record<string, unknown>;
      };
    }
  | {
      type: 'game_action';
      payload: {
        code: string;
        playerId?: string;
        hostToken?: string;
        roundId?: string;
        action: GameAction;
      };
    }
  | {
      type: 'end_game';
      payload: { code: string; playerId?: string; hostToken?: string };
    }
  | {
      type: 'return_to_lobby';
      payload: { code: string; playerId?: string; hostToken?: string };
    }
  | {
      type: 'ping';
      payload: { ts: number };
    };

// Server -> Client messages
export type ServerMessage =
  | {
      type: 'room_created';
      payload: { code: string; hostToken: string };
    }
  | {
      type: 'joined';
      payload: { code: string; playerId: string; name: string };
    }
  | {
      type: 'left';
      payload: { code: string; playerId: string };
    }
  | {
      type: 'room_state';
      payload: RoomState;
    }
  | {
      type: 'game_event';
      payload: { event: string; payload?: unknown };
    }
  | {
      type: 'tick';
      payload: { remainingMs: number; phaseEndsAt: number | null };
    }
  | {
      type: 'pong';
      payload: { ts: number };
    }
  | {
      type: 'error';
      payload: { code: string; message: string };
    };
