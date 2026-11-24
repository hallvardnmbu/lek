import type { GameContext, GamePlayer } from '../game';

export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function connectedPlayers(ctx: GameContext): GamePlayer[] {
  return ctx.getPlayers().filter((p) => p.connected);
}

export function connectedOrAllPlayers(ctx: GameContext): GamePlayer[] {
  const connected = connectedPlayers(ctx);
  return connected.length > 0 ? connected : ctx.getPlayers();
}

export function countConnectedActed(
  ctx: GameContext,
  pred: (playerId: string) => boolean
): { acted: number; total: number } {
  const connected = connectedPlayers(ctx);
  let acted = 0;
  for (const p of connected) {
    if (pred(p.id)) acted++;
  }
  return { acted, total: connected.length };
}

export function actedConnectedIds(
  ctx: GameContext,
  pred: (playerId: string) => boolean
): string[] {
  return connectedPlayers(ctx)
    .filter((p) => pred(p.id))
    .map((p) => p.id);
}

export function allConnected(ctx: GameContext, pred: (playerId: string) => boolean): boolean {
  const connected = connectedPlayers(ctx);
  return connected.length > 0 && connected.every((p) => pred(p.id));
}

export const MAX_GAME_SCORE = 5;

export function awardCappedScore(
  ctx: GameContext,
  playerId: string,
  delta: number,
  maxScore = MAX_GAME_SCORE
): number {
  if (delta <= 0) return 0;
  const current = ctx.getPlayer(playerId)?.score ?? 0;
  const awarded = Math.max(0, Math.min(delta, maxScore - current));
  if (awarded > 0) {
    ctx.addPlayerScore(playerId, awarded);
  }
  return awarded;
}

export function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

export function playerName(ctx: GameContext, playerId: string | null): string | null {
  return playerId ? (ctx.getPlayer(playerId)?.name ?? null) : null;
}

export function parseRounds(
  config: Record<string, unknown> | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  const requested = Number(config?.rounds);
  return Number.isFinite(requested)
    ? Math.min(max, Math.max(min, Math.round(requested)))
    : fallback;
}

export interface RoomHistory {
  remember(roomCode: string, item: string): void;
  isUsed(roomCode: string, item: string): boolean;
  recent(roomCode: string): string[];
}

export function createRoomHistory(maxRooms = 100, avoidWindow = 30, maxPerRoom = 200): RoomHistory {
  const history = new Map<string, string[]>();

  return {
    remember(roomCode: string, item: string) {
      if (!history.has(roomCode) && history.size >= maxRooms) {
        const oldest = history.keys().next().value;
        if (oldest !== undefined) history.delete(oldest);
      }
      const used = history.get(roomCode) ?? [];
      used.push(item.toLowerCase());
      if (used.length > maxPerRoom) {
        used.splice(0, used.length - maxPerRoom);
      }
      history.set(roomCode, used);
    },
    isUsed(roomCode: string, item: string) {
      return (history.get(roomCode) ?? []).includes(item.toLowerCase());
    },
    recent(roomCode: string) {
      return (history.get(roomCode) ?? []).slice(-avoidWindow);
    },
  };
}

export function takeUnusedItem<T>(
  roomCode: string,
  history: RoomHistory,
  keyOf: (item: T) => string,
  aiPool: T[] | null,
  fallbackPoolRef: { current: T[] | null },
  fallbacks: readonly T[]
): { item: T; isAi: boolean } {
  if (aiPool) {
    while (aiPool.length > 0) {
      const candidate = aiPool.shift()!;
      if (!history.isUsed(roomCode, keyOf(candidate))) {
        return { item: candidate, isAi: true };
      }
    }
  }

  for (let attempt = 0; attempt < fallbacks.length; attempt++) {
    if (!fallbackPoolRef.current || fallbackPoolRef.current.length === 0) {
      fallbackPoolRef.current = shuffle(fallbacks);
    }
    const candidate = fallbackPoolRef.current.pop()!;
    if (!history.isUsed(roomCode, keyOf(candidate))) {
      return { item: candidate, isAi: false };
    }
  }

  return {
    item: fallbacks[Math.floor(Math.random() * fallbacks.length)],
    isAi: false,
  };
}

export function takeUnusedPrompt(
  roomCode: string,
  history: RoomHistory,
  aiPool: string[] | null,
  fallbackPoolRef: { current: string[] | null },
  fallbacks: readonly string[]
): { text: string; isAi: boolean } {
  const { item, isAi } = takeUnusedItem(
    roomCode,
    history,
    (text) => text,
    aiPool,
    fallbackPoolRef,
    fallbacks
  );
  return { text: item, isAi };
}

export interface BaseVoteTally {
  playerId: string;
  name: string;
  votes: number;
}

export function buildVoteTally(ctx: GameContext, votes: Record<string, string>): BaseVoteTally[] {
  const counts = new Map<string, number>();
  for (const targetId of Object.values(votes)) {
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }

  return ctx
    .getPlayers()
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      votes: counts.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
}
