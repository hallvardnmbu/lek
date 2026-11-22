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
const EARTH_RADIUS_KM = 6371;

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
  spot: GeoSpot | null;
  guesses: Record<string, GuessEntry>;
  usedIds: string[];
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
    spot: null,
    guesses: {},
    usedIds,
    winnerId: null,
    drinkerId: null,
    error: null,
    inbox,
  };
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
  if (winner) {
    ctx.addPlayerScore(winner.id, 1);
  }

  state.drinkerId = null;
  const activePlayers = players.filter((p) => p.connected || state.guesses[p.id]);
  if (activePlayers.length >= 2) {
    const nonSubmitters = activePlayers.filter((p) => !state.guesses[p.id]);
    if (nonSubmitters.length > 0) {
      state.drinkerId = nonSubmitters[0].id;
    } else if (submitted.length >= 2) {
      state.drinkerId = submitted[submitted.length - 1].id;
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
        isWinner: isReveal && state.winnerId === p.id,
        drinks: isReveal && state.drinkerId === p.id,
        connected: p.connected,
        score: p.score,
      };
    })
    .sort((a, b) => {
      if (isReveal) {
        if (a.distanceKm !== null && b.distanceKm !== null) {
          return a.distanceKm - b.distanceKm;
        }
        if (a.distanceKm !== null) return -1;
        if (b.distanceKm !== null) return 1;
      }
      return b.score - a.score || a.name.localeCompare(b.name);
    });
}

export function createGeoGuessGame(
  fetcher: SpotFetcher = fetchRandomGeoSpot
): GameDefinition<GeoGuessState, GeoGuessHostView, GeoGuessPlayerView, GeoGuessAction> {
  return {
    id: 'geoguess',
    name: 'Geo-Guess Roulette',
    description: 'Spot the place on the TV, pin your guess on your phone. Closest wins, furthest drinks!',
    minPlayers: 1,
    maxPlayers: 12,

    onStart(ctx) {
      return startRound(ctx, fetcher, 1, []);
    },

    onPlayerAction(ctx, state, playerId, action) {
      const a = action as GeoGuessAction;

      if (a.type === 'next_round' || a.type === 'skip_spot') {
        if (state.phase === 'REVEAL' || (a.type === 'skip_spot' && state.phase !== 'LOADING')) {
          ctx.clearTimer();
          return startRound(ctx, fetcher, state.round + 1, state.usedIds);
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
        ctx.clearTimer();
        return startRound(ctx, fetcher, state.round + 1, state.usedIds);
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
        lockedIn: Boolean(guess),
        guess: guess ? { lat: guess.lat, lng: guess.lng } : null,
        target: isReveal ? (state.spot?.coords ?? null) : null,
        spotLabel: isReveal ? (state.spot?.label ?? null) : null,
        distanceKm: isReveal && guess ? Math.round(guess.distanceKm) : null,
        isWinner: isReveal && state.winnerId === playerId,
        drinks: isReveal && state.drinkerId === playerId,
      };
    },
  };
}

export const geoGuessGame = createGeoGuessGame();
