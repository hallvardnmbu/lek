import {
  type MusicQuizGuess,
  type MusicQuizHostView,
  type MusicQuizPhase,
  type MusicQuizPlayerView,
  type MusicQuizRoundResult,
  type MusicQuizSong,
} from '../../shared/games/musicquiz';

export interface MusicQuizState {
  phase: MusicQuizPhase;
  round: number;
  totalRounds: number;
  songs: MusicQuizSong[];
  roundStartedAt: number;
  guesses: Record<string, MusicQuizGuess>;
  lastResults: MusicQuizRoundResult[];
}
import type { GameContext, GameDefinition } from '../game';
import { allConnected, awardCappedScore, connectedPlayers, createRoomHistory, parseRounds, shuffle, withoutKey } from './helpers';
import { getMusicQuizCatalog, previewUrlFor, refreshPreviews } from './musicquizCatalog';

const INTRO_MS = 4_000;
const GUESS_MS = 30_000;
const REVEAL_MS = 8_000;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 20;
const DEFAULT_ROUNDS = 5;
const CORRECT_POINTS = 1;
const MAX_SPEED_BONUS = 2;

const songHistory = createRoomHistory();

function pickSongs(roomCode: string, catalog: MusicQuizSong[], count: number): MusicQuizSong[] {
  const unused = catalog.filter((song) => !songHistory.isUsed(roomCode, song.id));
  const pool = unused.length >= count ? unused : catalog;
  const chosen = shuffle(pool).slice(0, count);
  for (const song of chosen) {
    songHistory.remember(roomCode, song.id);
  }
  return chosen;
}

function currentSong(state: MusicQuizState): MusicQuizSong | undefined {
  return state.songs[state.round - 1];
}

function maybeReveal(ctx: GameContext, state: MusicQuizState): MusicQuizState {
  if (state.phase === 'GUESSING' && allConnected(ctx, (id) => state.guesses[id] !== undefined)) {
    return reveal(ctx, state);
  }
  return state;
}

function sharedView(ctx: GameContext, state: MusicQuizState) {
  const song = currentSong(state);
  const connected = connectedPlayers(ctx);
  return {
    phase: state.phase,
    round: state.round,
    totalRounds: state.totalRounds,
    song: state.phase === 'REVEAL' && song ? { title: song.title, artist: song.artist } : null,
    guessedCount: connected.filter((p) => state.guesses[p.id] !== undefined).length,
    connectedCount: connected.length,
    results: state.lastResults,
  };
}

function speedBonus(state: MusicQuizState, guessedAt: number): number {
  const remainingMs = Math.max(0, GUESS_MS - (guessedAt - state.roundStartedAt));
  return Math.round((MAX_SPEED_BONUS * remainingMs) / GUESS_MS);
}

function reveal(ctx: GameContext, state: MusicQuizState): MusicQuizState {
  const song = currentSong(state);
  if (!song) {
    ctx.endGame();
    return state;
  }
  const results: MusicQuizRoundResult[] = ctx
    .getPlayers()
    .map((p) => {
      const guess = state.guesses[p.id];
      const correct = guess?.songId === song.id;
      const rawPoints = correct && guess ? CORRECT_POINTS + speedBonus(state, guess.at) : 0;
      const points = awardCappedScore(ctx, p.id, rawPoints);
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
  if (state.round < state.totalRounds) {
    ctx.setTimer(REVEAL_MS);
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
    name: 'Musiquiz',
    description: 'A clip plays on the TV. Search the songs on your phone and lock in fast.',
    minPlayers: 2,
    maxPlayers: 12,

    onStart(ctx, config) {
      const catalog = getCatalog();
      const totalRounds = Math.min(parseRounds(config, MIN_ROUNDS, MAX_ROUNDS, DEFAULT_ROUNDS), catalog.length);

      if (totalRounds === 0) {
        ctx.endGame();
        return {
          phase: 'REVEAL',
          round: 0,
          totalRounds: 0,
          songs: [],
          roundStartedAt: 0,
          guesses: {},
          lastResults: [],
        };
      }

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
      if (action.type === 'reveal' && state.phase === 'GUESSING') {
        return reveal(ctx, state);
      }
      if (action.type === 'next' && state.phase === 'REVEAL') {
        return nextRound(ctx, state);
      }
      return state;
    },

    onPlayerDisconnect(ctx, state) {
      return maybeReveal(ctx, state);
    },

    onPlayerLeave(ctx, state, playerId) {
      state.guesses = withoutKey(state.guesses, playerId);
      return maybeReveal(ctx, state);
    },

    getHostView(state, ctx) {
      const song = currentSong(state);
      return {
        ...sharedView(ctx, state),
        audioUrl: state.phase === 'GUESSING' && song ? previewUrlFor(song) : null,
      };
    },

    getPlayerView(state, playerId, ctx) {
      return {
        ...sharedView(ctx, state),
        myGuessSongId: state.guesses[playerId]?.songId ?? null,
        myResult: state.lastResults.find((r) => r.playerId === playerId) ?? null,
      };
    },
  };
}

export const musicQuizGame = createMusicQuizGame();
