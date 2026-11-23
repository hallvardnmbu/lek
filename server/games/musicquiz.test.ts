import { describe, expect, it } from 'bun:test';
import type { GameContext, GameDefinition } from '../game';
import type {
  MusicQuizHostView,
  MusicQuizPlayerView,
  MusicQuizSong,
} from '../../shared/games/musicquiz';
import { type MusicQuizState, createMusicQuizGame } from './musicquiz';

type FullMusicQuizGame = Required<
  GameDefinition<MusicQuizState, MusicQuizHostView, MusicQuizPlayerView>
>;

const TEST_SONGS: MusicQuizSong[] = [
  { id: 'song-a', title: 'Alpha Anthem', artist: 'The Aardvarks', previewUrl: 'https://example.com/a.mp3' },
  { id: 'song-b', title: 'Bravo Ballad', artist: 'The Bears', previewUrl: 'https://example.com/b.mp3' },
  { id: 'song-c', title: 'Chorus Chant', artist: 'The Cats', previewUrl: null },
  { id: 'song-d', title: 'Delta Disco', artist: 'The Dogs', previewUrl: 'https://example.com/d.mp3' },
  { id: 'song-e', title: 'Echo Etude', artist: 'The Emus', previewUrl: 'https://example.com/e.mp3' },
  { id: 'song-f', title: 'Foxtrot Funk', artist: 'The Foxes', previewUrl: 'https://example.com/f.mp3' },
];

function makeGame(): FullMusicQuizGame {
  return createMusicQuizGame(() => TEST_SONGS) as FullMusicQuizGame;
}

interface TestPlayer {
  id: string;
  name: string;
  connected: boolean;
}

function createTestCtx(roomCode: string, players: TestPlayer[]) {
  const scores = new Map<string, number>();
  let ended = false;

  const toGamePlayers = () =>
    players.map((p) => ({
      id: p.id,
      name: p.name,
      score: scores.get(p.id) ?? 0,
      totalScore: scores.get(p.id) ?? 0,
      connected: p.connected,
      isVip: false,
      meta: {},
    }));

  const ctx: GameContext = {
    roomCode,
    getPlayers: () => toGamePlayers(),
    getPlayer: (id) => toGamePlayers().find((p) => p.id === id),
    setPlayerScore: (id, score) => scores.set(id, score),
    addPlayerScore: (id, delta) => scores.set(id, (scores.get(id) ?? 0) + delta),
    setPlayerMeta: () => {},
    setTimer: () => {},
    clearTimer: () => {},
    dispatch: () => {},
    broadcastEvent: () => {},
    sendEventToHost: () => {},
    sendEventToPlayer: () => {},
    emitWebhook: () => {},
    endGame: () => {
      ended = true;
    },
  };

  return {
    ctx,
    isEnded: () => ended,
    score: (id: string) => scores.get(id) ?? 0,
  };
}

const twoPlayers: TestPlayer[] = [
  { id: 'p1', name: 'Alice', connected: true },
  { id: 'p2', name: 'Bob', connected: true },
];

describe('Music Quiz game', () => {
  it('runs intro -> guessing -> reveal rounds and ends after totalRounds', () => {
    const game = makeGame();
    const { ctx, isEnded, score } = createTestCtx('mq-lifecycle', twoPlayers);

    let state = game.onStart(ctx, { rounds: 2 });
    expect(state.phase).toBe('INTRO');
    expect(state.round).toBe(1);
    expect(state.totalRounds).toBe(2);
    expect(state.songs).toHaveLength(2);

    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('GUESSING');

    const guessingHost = game.getHostView(state, ctx);
    expect(guessingHost.audioUrl).toBe(state.songs[0].previewUrl);
    expect(guessingHost.song).toBeNull();

    const guessingView = game.getPlayerView(state, 'p1', ctx);
    expect(guessingView.song).toBeNull();
    expect(guessingView.results).toEqual([]);
    expect(guessingView.myGuessSongId).toBeNull();

    const answerId = state.songs[0].id;
    const wrongId = TEST_SONGS.find((s) => s.id !== answerId)!.id;

    state = game.onPlayerAction(ctx, state, 'p1', { type: 'guess', payload: { songId: answerId } })!;
    expect(state.phase).toBe('GUESSING');

    state = game.onPlayerAction(ctx, state, 'p2', { type: 'guess', payload: { songId: wrongId } })!;
    expect(state.phase).toBe('REVEAL');

    const hostView = game.getHostView(state, ctx);
    expect(hostView.song?.title).toBe(state.songs[0].title);
    expect(hostView.song?.artist).toBe(state.songs[0].artist);
    expect(hostView.guessedCount).toBe(2);

    const p1View = game.getPlayerView(state, 'p1', ctx);
    expect(p1View.myResult?.correct).toBe(true);
    expect(p1View.myResult?.points).toBeGreaterThanOrEqual(1);
    expect(p1View.myResult?.points).toBeLessThanOrEqual(5);

    const p2View = game.getPlayerView(state, 'p2', ctx);
    expect(p2View.myResult?.correct).toBe(false);
    expect(score('p1')).toBe(p1View.myResult!.points);
    expect(score('p2')).toBe(0);

    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('INTRO');
    expect(state.round).toBe(2);

    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('GUESSING');
    expect(game.getPlayerView(state, 'p1', ctx).myGuessSongId).toBeNull();

    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('REVEAL');
    expect(game.getHostView(state, ctx).results.every((r) => !r.correct)).toBe(true);

    state = game.onTimerExpired(ctx, state)!;
    expect(isEnded()).toBe(true);
  });

  it('locks one guess per player and ignores guesses outside the guessing phase', () => {
    const game = makeGame();
    const { ctx } = createTestCtx('mq-lock', twoPlayers);

    let state = game.onStart(ctx, { rounds: 2 });
    state = game.onTimerExpired(ctx, state)!;

    const answerId = state.songs[0].id;
    const wrongId = TEST_SONGS.find((s) => s.id !== answerId)!.id;

    state = game.onPlayerAction(ctx, state, 'p1', { type: 'guess', payload: { songId: 'nope' } })!;
    expect(game.getPlayerView(state, 'p1', ctx).myGuessSongId).toBeNull();

    state = game.onPlayerAction(ctx, state, 'p1', { type: 'guess', payload: { songId: wrongId } })!;
    state = game.onPlayerAction(ctx, state, 'p1', { type: 'guess', payload: { songId: answerId } })!;
    expect(game.getPlayerView(state, 'p1', ctx).myGuessSongId).toBe(wrongId);
    expect(state.phase).toBe('GUESSING');

    state = game.onHostAction(ctx, state, { type: 'reveal' })!;
    expect(state.phase).toBe('REVEAL');

    state = game.onPlayerAction(ctx, state, 'p2', { type: 'guess', payload: { songId: answerId } })!;
    expect(state.phase).toBe('REVEAL');
    expect(game.getPlayerView(state, 'p2', ctx).myGuessSongId).toBeNull();
  });

  it('rewards faster correct guesses with more points', async () => {
    const game = makeGame();
    const { ctx, score } = createTestCtx('mq-speed', twoPlayers);

    let state = game.onStart(ctx, { rounds: 2 });
    state = game.onTimerExpired(ctx, state)!;

    const answerId = state.songs[0].id;
    state = game.onPlayerAction(ctx, state, 'p1', { type: 'guess', payload: { songId: answerId } })!;
    state.roundStartedAt -= 10_000;
    state.guesses.p1.at -= 10_000;
    state = game.onPlayerAction(ctx, state, 'p2', { type: 'guess', payload: { songId: answerId } })!;

    expect(state.phase).toBe('REVEAL');
    expect(score('p1')).toBeGreaterThan(score('p2'));
    expect(score('p2')).toBeGreaterThanOrEqual(1);
    expect(score('p1')).toBeLessThanOrEqual(5);
  });

  it('reveals early once every connected player has guessed, even after a disconnect', () => {
    const game = makeGame();
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Carol', connected: true },
    ];
    const { ctx } = createTestCtx('mq-early', players);

    let state = game.onStart(ctx, { rounds: 2 });
    state = game.onTimerExpired(ctx, state)!;

    const answerId = state.songs[0].id;
    state = game.onPlayerAction(ctx, state, 'p1', { type: 'guess', payload: { songId: answerId } })!;
    state = game.onPlayerAction(ctx, state, 'p2', { type: 'guess', payload: { songId: answerId } })!;
    expect(state.phase).toBe('GUESSING');

    players[2].connected = false;
    state = game.onPlayerDisconnect(ctx, state, 'p3')!;
    expect(state.phase).toBe('REVEAL');

    const hostView = game.getHostView(state, ctx);
    expect(hostView.results).toHaveLength(3);
    expect(hostView.results.find((r) => r.playerId === 'p3')?.correct).toBe(false);
  });

  it('reveals on timer expiry when only some players guessed', () => {
    const game = makeGame();
    const { ctx, score } = createTestCtx('mq-expiry', twoPlayers);

    let state = game.onStart(ctx, { rounds: 2 });
    state = game.onTimerExpired(ctx, state)!;

    const answerId = state.songs[0].id;
    state = game.onPlayerAction(ctx, state, 'p1', { type: 'guess', payload: { songId: answerId } })!;
    expect(game.getHostView(state, ctx).guessedCount).toBe(1);

    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('REVEAL');
    expect(score('p1')).toBeGreaterThanOrEqual(1);
    expect(score('p1')).toBeLessThanOrEqual(5);

    const hostView = game.getHostView(state, ctx);
    expect(hostView.results).toHaveLength(2);
    expect(hostView.results.find((r) => r.playerId === 'p2')?.correct).toBe(false);
  });

  it('waits for the host on the final reveal and ends via the next action', () => {
    const game = makeGame();
    const { ctx, isEnded } = createTestCtx('mq-final', twoPlayers);

    let state = game.onStart(ctx, { rounds: 1 });
    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('GUESSING');

    const answerId = state.songs[0].id;
    state = game.onPlayerAction(ctx, state, 'p1', { type: 'guess', payload: { songId: answerId } })!;
    state = game.onPlayerAction(ctx, state, 'p2', { type: 'guess', payload: { songId: answerId } })!;
    expect(state.phase).toBe('REVEAL');
    expect(isEnded()).toBe(false);

    state = game.onHostAction(ctx, state, { type: 'next' })!;
    expect(state.phase).toBe('REVEAL');
    expect(isEnded()).toBe(true);
  });

  it('clamps rounds to the catalog size and avoids repeating songs across games', () => {
    const game = makeGame();

    const clampCtx = createTestCtx('mq-clamp', twoPlayers);
    expect(game.onStart(clampCtx.ctx, { rounds: 99 }).totalRounds).toBe(TEST_SONGS.length);
    expect(game.onStart(clampCtx.ctx).totalRounds).toBe(5);

    const repeatCtx = createTestCtx('mq-repeat', twoPlayers);
    const first = game.onStart(repeatCtx.ctx, { rounds: 2 });
    const second = game.onStart(repeatCtx.ctx, { rounds: 2 });
    const firstIds = new Set(first.songs.map((s) => s.id));
    const overlap = second.songs.filter((s) => firstIds.has(s.id));
    expect(overlap).toHaveLength(0);
  });

  it('ends cleanly when the catalog is empty', () => {
    const emptyGame = createMusicQuizGame(() => []) as FullMusicQuizGame;
    const { ctx, isEnded } = createTestCtx('mq-empty', twoPlayers);

    const state = emptyGame.onStart(ctx);
    expect(state.totalRounds).toBe(0);
    expect(isEnded()).toBe(true);
    expect(emptyGame.getHostView(state, ctx).song).toBeNull();
    expect(emptyGame.getHostView(state, ctx).audioUrl).toBeNull();
    expect(emptyGame.getPlayerView(state, 'p1', ctx).song).toBeNull();
  });
});
