import {
  type MusicQuizHostView,
  type MusicQuizPlayerView,
  type MusicQuizRoundResult,
  type MusicQuizSong,
  type MusicQuizState,
} from '../../shared/games/musicquiz';
import type { GameContext, GameDefinition } from '../game';
import { getMusicQuizCatalog, previewUrlFor, refreshPreviews } from './musicquizCatalog';

const INTRO_MS = 4_000;
const GUESS_MS = 30_000;
const REVEAL_MS = 8_000;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 20;
const DEFAULT_ROUNDS = 5;
const CORRECT_POINTS = 100;
const MAX_SPEED_BONUS = 100;
const MAX_HISTORY_ROOMS = 100;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const roomSongHistory = new Map<string, string[]>();

function rememberSongs(roomCode: string, songs: MusicQuizSong[]): void {
  if (!roomSongHistory.has(roomCode) && roomSongHistory.size >= MAX_HISTORY_ROOMS) {
    const oldest = roomSongHistory.keys().next().value;
    if (oldest !== undefined) roomSongHistory.delete(oldest);
  }
  const used = roomSongHistory.get(roomCode) ?? [];
  for (const song of songs) {
    used.push(song.id);
  }
  roomSongHistory.set(roomCode, used);
}

function pickSongs(roomCode: string, catalog: MusicQuizSong[], count: number): MusicQuizSong[] {
  const used = roomSongHistory.get(roomCode) ?? [];
  const unused = catalog.filter((song) => !used.includes(song.id));
  const pool = unused.length >= count ? unused : catalog;
  const chosen = shuffle(pool).slice(0, count);
  rememberSongs(roomCode, chosen);
  return chosen;
}

function connectedPlayers(ctx: GameContext) {
  return ctx.getPlayers().filter((p) => p.connected);
}

function currentSong(state: MusicQuizState): MusicQuizSong {
  return state.songs[state.round - 1];
}

function guessedCount(ctx: GameContext, state: MusicQuizState): number {
  return connectedPlayers(ctx).filter((p) => state.guesses[p.id] !== undefined).length;
}

function allConnectedGuessed(ctx: GameContext, state: MusicQuizState): boolean {
  const players = connectedPlayers(ctx);
  return players.length > 0 && players.every((p) => state.guesses[p.id] !== undefined);
}

function speedBonus(state: MusicQuizState, guessedAt: number): number {
  const remainingMs = Math.max(0, GUESS_MS - (guessedAt - state.roundStartedAt));
  return Math.round((MAX_SPEED_BONUS * remainingMs) / GUESS_MS);
}

function reveal(ctx: GameContext, state: MusicQuizState): MusicQuizState {
  const song = currentSong(state);
  const results: MusicQuizRoundResult[] = ctx
    .getPlayers()
    .map((p) => {
      const guess = state.guesses[p.id];
      const correct = guess?.songId === song.id;
      const points = correct && guess ? CORRECT_POINTS + speedBonus(state, guess.at) : 0;
      if (points > 0) {
        ctx.addPlayerScore(p.id, points);
      }
      return {
        playerId: p.id,
        playerName: p.name,
        guessSongId: guess?.songId ?? null,
        correct,
        points,
      };
    })
    .sort((a, b) => b.points - a.points || a.playerName.localeCompare(b.playerName));

  state.phase = 'REVEAL';
  state.lastResults = results;
  ctx.setTimer(REVEAL_MS);
  return state;
}

function maybeReveal(ctx: GameContext, state: MusicQuizState): MusicQuizState {
  if (state.phase === 'GUESSING' && allConnectedGuessed(ctx, state)) {
    return reveal(ctx, state);
  }
  return state;
}

function startGuessing(ctx: GameContext, state: MusicQuizState): MusicQuizState {
  state.phase = 'GUESSING';
  state.roundStartedAt = Date.now();
  ctx.setTimer(GUESS_MS);
  return state;
}

function nextRound(ctx: GameContext, state: MusicQuizState): MusicQuizState {
  if (state.round >= state.totalRounds) {
    ctx.endGame();
    return state;
  }
  state.round += 1;
  state.phase = 'INTRO';
  state.guesses = {};
  state.lastResults = [];
  ctx.setTimer(INTRO_MS);
  return state;
}

export function createMusicQuizGame(
  getCatalog: () => MusicQuizSong[] = getMusicQuizCatalog
): GameDefinition<MusicQuizState, MusicQuizHostView, MusicQuizPlayerView> {
  return {
    id: 'music-quiz',
    name: 'Music Quiz',
    description: 'A clip plays on the TV. Search the songs on your phone and lock in fast.',
    minPlayers: 1,
    maxPlayers: 12,

    onStart(ctx, config) {
      const catalog = getCatalog();
      const requested = Number(config?.rounds);
      const rounds = Number.isFinite(requested)
        ? Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.round(requested)))
        : DEFAULT_ROUNDS;
      const totalRounds = Math.min(rounds, catalog.length);

      const state: MusicQuizState = {
        phase: 'INTRO',
        round: 1,
        totalRounds,
        songs: pickSongs(ctx.roomCode, catalog, totalRounds),
        roundStartedAt: 0,
        guesses: {},
        lastResults: [],
      };

      ctx.setTimer(INTRO_MS);
      refreshPreviews(state.songs);
      return state;
    },

    onTimerExpired(ctx, state) {
      if (state.phase === 'INTRO') {
        return startGuessing(ctx, state);
      }
      if (state.phase === 'GUESSING') {
        return reveal(ctx, state);
      }
      return nextRound(ctx, state);
    },

    onPlayerAction(ctx, state, playerId, action) {
      if (state.phase !== 'GUESSING' || action.type !== 'guess') {
        return state;
      }
      if (state.guesses[playerId] !== undefined) {
        return state;
      }
      const songId = (action.payload as { songId?: unknown } | undefined)?.songId;
      if (typeof songId !== 'string' || !getCatalog().some((song) => song.id === songId)) {
        return state;
      }
      state.guesses = { ...state.guesses, [playerId]: { songId, at: Date.now() } };
      return maybeReveal(ctx, state);
    },

    onHostAction(ctx, state, action) {
      if (action.type !== 'reveal' || state.phase !== 'GUESSING') {
        return state;
      }
      return reveal(ctx, state);
    },

    onPlayerDisconnect(ctx, state) {
      return maybeReveal(ctx, state);
    },

    onPlayerLeave(ctx, state, playerId) {
      const { [playerId]: _removed, ...guesses } = state.guesses;
      state.guesses = guesses;
      return maybeReveal(ctx, state);
    },

    getHostView(state, ctx) {
      const song = currentSong(state);
      const guessing = state.phase === 'GUESSING';
      return {
        phase: state.phase,
        round: state.round,
        totalRounds: state.totalRounds,
        audioUrl: guessing ? previewUrlFor(song) : null,
        song: state.phase === 'REVEAL' ? { title: song.title, artist: song.artist } : null,
        guessedCount: guessedCount(ctx, state),
        connectedCount: connectedPlayers(ctx).length,
        results: state.lastResults,
      };
    },

    getPlayerView(state, playerId, ctx) {
      const song = currentSong(state);
      return {
        phase: state.phase,
        round: state.round,
        totalRounds: state.totalRounds,
        myGuessSongId: state.guesses[playerId]?.songId ?? null,
        guessedCount: guessedCount(ctx, state),
        connectedCount: connectedPlayers(ctx).length,
        song: state.phase === 'REVEAL' ? { title: song.title, artist: song.artist } : null,
        myResult: state.lastResults.find((r) => r.playerId === playerId) ?? null,
        results: state.lastResults,
      };
    },
  };
}

export const musicQuizGame = createMusicQuizGame();
