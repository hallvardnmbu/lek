import type {
  GeoGuessAction,
  GeoGuessHostView,
  GeoGuessPlayerView,
  GeoGuessPhase,
  GeoGuessResultEntry,
  GeoPoint,
} from '../../shared/games/geoguess';
import type { GameContext, GameDefinition } from '../game';
import { fetchRandomGeoSpot, type GeoSpot, type SpotFetcher } from './geoguess-spots';
import { connectedPlayers } from './helpers';

const POLL_MS = 120;
const ROUND_DURATION_MS = 45_000;
const TOTAL_ROUNDS = 5;
const EARTH_RADIUS_KM = 6371;
const MAX_ROUND_POINTS = 100;
const POINTS_FALLOFF_KM = 2_000;

const PLAYER_COLORS = [
  '#38bdf8',
  '#f472b6',
  '#a78bfa',
  '#fb923c',
  '#4ade80',
  '#facc15',
  '#2dd4bf',
  '#f87171',
];

interface GuessEntry {
  lat: number;
  lng: number;
  distanceKm: number;
}

interface GeoGuessInbox {
  round: number;
  spot?: GeoSpot;
  error?: string;
}

interface GeoGuessState {
  phase: GeoGuessPhase;
  round: number;
  totalRounds: number;
  spot: GeoSpot | null;
  guesses: Record<string, GuessEntry>;
  usedIds: string[];
  roundPoints: Record<string, number>;
  winnerId: string | null;
  drinkerId: string | null;
  error: string | null;
  inbox: GeoGuessInbox;
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function clampLat(lat: number): number {
  return Math.max(-85, Math.min(85, lat));
}

function normalizeLng(lng: number): number {
  let v = ((lng + 180) % 360 + 360) % 360 - 180;
  if (v === -180 && lng > 0) v = 180;
  return v;
}

function closenessPoints(distanceKm: number): number {
  return Math.max(0, Math.round(MAX_ROUND_POINTS * Math.exp(-distanceKm / POINTS_FALLOFF_KM)));
}

function playerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

function startRound(
  ctx: GameContext,
  fetcher: SpotFetcher,
  round: number,
  previousUsedIds: string[]
): GeoGuessState {
  const inbox: GeoGuessInbox = { round };
  const usedIds = previousUsedIds.length >= 40 ? [] : [...previousUsedIds];

  fetcher(usedIds)
    .then((spot) => {
      if (inbox.round === round) {
        inbox.spot = spot;
      }
    })
    .catch((err) => {
      if (inbox.round === round) {
        inbox.error = err instanceof Error ? err.message : 'Failed to load location.';
      }
    });

  ctx.setTimer(POLL_MS);

  return {
    phase: 'LOADING',
    round,
    totalRounds: TOTAL_ROUNDS,
    spot: null,
    guesses: {},
    usedIds,
    roundPoints: {},
    winnerId: null,
    drinkerId: null,
    error: null,
    inbox,
  };
}

function advanceRound(
  ctx: GameContext,
  fetcher: SpotFetcher,
  state: GeoGuessState
): GeoGuessState {
  if (state.round >= state.totalRounds) {
    ctx.endGame();
    return state;
  }
  ctx.clearTimer();
  return startRound(ctx, fetcher, state.round + 1, state.usedIds);
}

function revealRound(ctx: GameContext, state: GeoGuessState): void {
  if (state.phase !== 'GUESSING') return;

  ctx.clearTimer();
  state.phase = 'REVEAL';

  const players = ctx.getPlayers();
  const submitted = players
    .filter((p) => Boolean(state.guesses[p.id]))
    .map((p) => ({
      id: p.id,
      distanceKm: state.guesses[p.id].distanceKm,
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const winner = submitted[0] ?? null;
  state.winnerId = winner ? winner.id : null;

  for (const p of players) {
    const guess = state.guesses[p.id];
    if (!guess) continue;
    const points = closenessPoints(guess.distanceKm);
    state.roundPoints[p.id] = points;
    ctx.addPlayerScore(p.id, points);
  }

  state.drinkerId = null;
  if (state.round >= state.totalRounds) {
    const connected = players.filter((p) => p.connected);
    if (connected.length >= 2) {
      const finalDistance = (id: string) =>
        state.guesses[id] ? state.guesses[id].distanceKm : Number.POSITIVE_INFINITY;
      state.drinkerId = [...connected].sort(
        (a, b) =>
          a.score - b.score ||
          finalDistance(b.id) - finalDistance(a.id) ||
          a.name.localeCompare(b.name)
      )[0].id;
    }
  }

  ctx.broadcastEvent('geoguess_reveal', {
    winnerId: state.winnerId,
    drinkerId: state.drinkerId,
  });
}

function maybeRevealOnAllGuessed(ctx: GameContext, state: GeoGuessState): void {
  if (state.phase !== 'GUESSING') return;
  const connected = connectedPlayers(ctx);
  if (connected.length > 0 && connected.every((p) => Boolean(state.guesses[p.id]))) {
    revealRound(ctx, state);
  }
}

function playerName(ctx: GameContext, playerId: string | null): string | null {
  return playerId ? (ctx.getPlayer(playerId)?.name ?? null) : null;
}

function buildResultEntries(ctx: GameContext, state: GeoGuessState): GeoGuessResultEntry[] {
  const isReveal = state.phase === 'REVEAL';
  return ctx
    .getPlayers()
    .map((p, idx) => {
      const guess = state.guesses[p.id];
      return {
        playerId: p.id,
        name: p.name,
        color: playerColor(idx),
        guess: isReveal && guess ? { lat: guess.lat, lng: guess.lng } : null,
        distanceKm: isReveal && guess ? Math.round(guess.distanceKm) : null,
        roundPoints: isReveal && state.roundPoints[p.id] !== undefined ? state.roundPoints[p.id] : null,
        isWinner: isReveal && state.winnerId === p.id,
        drinks: isReveal && state.drinkerId === p.id,
        connected: p.connected,
        score: p.score,
      };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (isReveal) {
        const aDist = a.distanceKm ?? Number.POSITIVE_INFINITY;
        const bDist = b.distanceKm ?? Number.POSITIVE_INFINITY;
        if (aDist !== bDist) return aDist - bDist;
      }
      return a.name.localeCompare(b.name);
    });
}

export function createGeoGuessGame(
  fetcher: SpotFetcher = fetchRandomGeoSpot
): GameDefinition<GeoGuessState, GeoGuessHostView, GeoGuessPlayerView, GeoGuessAction> {
  return {
    id: 'geoguess',
    name: 'Geo-Guess Roulette',
    description:
      'Spot the place on the TV, pin your guess on your phone. Closest scores the most — last place after 5 rounds drinks!',
    minPlayers: 1,
    maxPlayers: 12,

    onStart(ctx) {
      return startRound(ctx, fetcher, 1, []);
    },

    onPlayerAction(ctx, state, playerId, action) {
      const a = action as GeoGuessAction;

      if (a.type === 'next_round' || a.type === 'skip_spot') {
        if (state.phase === 'REVEAL' || (a.type === 'skip_spot' && state.phase !== 'LOADING')) {
          return advanceRound(ctx, fetcher, state);
        }
        return state;
      }

      if (a.type !== 'submit_guess') return state;
      if (state.phase !== 'GUESSING' || !state.spot) return state;

      const lat = Number(a.payload?.lat);
      const lng = Number(a.payload?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return state;

      const clamped: GeoPoint = {
        lat: clampLat(lat),
        lng: normalizeLng(lng),
      };

      state.guesses[playerId] = {
        lat: clamped.lat,
        lng: clamped.lng,
        distanceKm: haversineKm(clamped, state.spot.coords),
      };

      maybeRevealOnAllGuessed(ctx, state);

      return state;
    },

    onHostAction(ctx, state, action) {
      if (action.type === 'next_round' || action.type === 'skip_spot') {
        return advanceRound(ctx, fetcher, state);
      }
      return state;
    },

    onTimerExpired(ctx, state) {
      if (state.phase === 'LOADING') {
        if (state.inbox.error) {
          state.error = state.inbox.error;
          return state;
        }
        if (state.inbox.spot) {
          state.spot = state.inbox.spot;
          state.usedIds.push(state.inbox.spot.id);
          state.phase = 'GUESSING';
          ctx.setTimer(ROUND_DURATION_MS);
          return state;
        }
        ctx.setTimer(POLL_MS);
        return state;
      }

      if (state.phase === 'GUESSING') {
        revealRound(ctx, state);
      }

      return state;
    },

    onPlayerDisconnect(ctx, state) {
      maybeRevealOnAllGuessed(ctx, state);
      return state;
    },

    onPlayerLeave(ctx, state, playerId) {
      delete state.guesses[playerId];
      maybeRevealOnAllGuessed(ctx, state);
      return state;
    },

    getHostView(state, ctx): GeoGuessHostView {
      const connected = connectedPlayers(ctx);
      const lockedCount = connected.filter((p) => Boolean(state.guesses[p.id])).length;
      const isReveal = state.phase === 'REVEAL';

      return {
        phase: state.phase,
        round: state.round,
        totalRounds: state.totalRounds,
        imageUrl: state.spot?.imageUrl ?? null,
        spotLabel: isReveal ? (state.spot?.label ?? null) : null,
        target: isReveal ? (state.spot?.coords ?? null) : null,
        lockedCount,
        totalCount: connected.length,
        players: buildResultEntries(ctx, state),
        winnerName: playerName(ctx, state.winnerId),
        drinkerName: playerName(ctx, state.drinkerId),
        error: state.error,
      };
    },

    getPlayerView(state, playerId): GeoGuessPlayerView {
      const guess = state.guesses[playerId];
      const isReveal = state.phase === 'REVEAL';

      return {
        phase: state.phase,
        round: state.round,
        totalRounds: state.totalRounds,
        lockedIn: Boolean(guess),
        guess: guess ? { lat: guess.lat, lng: guess.lng } : null,
        target: isReveal ? (state.spot?.coords ?? null) : null,
        spotLabel: isReveal ? (state.spot?.label ?? null) : null,
        distanceKm: isReveal && guess ? Math.round(guess.distanceKm) : null,
        roundPoints: isReveal && state.roundPoints[playerId] !== undefined ? state.roundPoints[playerId] : null,
        isWinner: isReveal && state.winnerId === playerId,
        drinks: isReveal && state.drinkerId === playerId,
      };
    },
  };
}

export const geoGuessGame = createGeoGuessGame();
