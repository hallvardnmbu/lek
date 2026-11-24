import { describe, expect, test } from 'bun:test';
import type { GameContext, GamePlayer } from '../game';
import { REVEAL_DURATION_MS, createGeoGuessGame, haversineKm } from './geoguess';
import type { GeoSpot } from './geoguess-spots';

function makeContext(playersInput: Array<{ id: string; name: string; connected?: boolean }>) {
  const players: GamePlayer[] = playersInput.map((p) => ({
    id: p.id,
    name: p.name,
    score: 0,
    totalScore: 0,
    connected: p.connected ?? true,
    meta: {},
  }));

  const events: Array<{ event: string; payload: unknown }> = [];
  let ended = false;
  let currentState: any;
  let lastTimer: { ms: number; showCountdown?: boolean } | null = null;

  const ctx: GameContext = {
    roomCode: 'ABCD',
    getPlayers: () => players,
    getPlayer: (id) => players.find((p) => p.id === id),
    setPlayerScore: (id, score) => {
      const p = players.find((item) => item.id === id);
      if (p) p.score = score;
    },
    addPlayerScore: (id, delta) => {
      const p = players.find((item) => item.id === id);
      if (p) p.score += delta;
    },
    setPlayerMeta: () => {},
    setTimer: (ms, showCountdown) => {
      lastTimer = { ms, showCountdown };
    },
    clearTimer: () => {
      lastTimer = null;
    },
    dispatch: (fn) => {
      if (currentState === undefined) return;
      const next = fn(currentState);
      if (next !== undefined) currentState = next;
    },
    broadcastEvent: (event, payload) => {
      events.push({ event, payload });
    },
    sendEventToHost: () => {},
    sendEventToPlayer: () => {},
    emitWebhook: () => {},
    endGame: () => {
      ended = true;
    },
  };

  return {
    ctx,
    players,
    events,
    setState: (s: unknown) => {
      currentState = s;
    },
    getTimer: () => lastTimer,
    isEnded: () => ended,
  };
}

const TEST_SPOT: GeoSpot = {
  id: 'paris',
  label: 'Paris, France',
  imageUrl: 'https://example.com/paris.jpg',
  coords: { lat: 48.8566, lng: 2.3522 },
};

describe('geoguess game', () => {
  test('haversineKm computes realistic distance', () => {
    const km = haversineKm(
      { lat: 48.8566, lng: 2.3522 },
      { lat: 51.5072, lng: -0.1276 }
    );
    expect(km).toBeGreaterThan(330);
    expect(km).toBeLessThan(360);
  });

  test('has no manual host actions and ignores legacy round-advance actions', async () => {
    const game = createGeoGuessGame(async () => TEST_SPOT);
    expect(game.onHostAction).toBeUndefined();

    const { ctx, setState } = makeContext([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);

    let state = game.onStart(ctx);
    setState(state);
    await Promise.resolve();
    expect(state.phase).toBe('GUESSING');

    state = game.onPlayerAction(ctx, state, 'p1', { type: 'skip_spot' } as never) ?? state;
    expect(state.phase).toBe('GUESSING');
    expect(state.round).toBe(1);
  });

  test('loads spot, exposes lockedPlayerIds, awards closeness points and sets reveal timer', async () => {
    const game = createGeoGuessGame(async () => TEST_SPOT);
    const { ctx, players, events, setState, getTimer } = makeContext([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Charlie' },
    ]);

    let state = game.onStart(ctx);
    setState(state);
    expect(state.phase).toBe('LOADING');
    expect(state.totalRounds).toBe(5);

    await Promise.resolve();
    expect(state.phase).toBe('GUESSING');

    const hostGuessing = game.getHostView(state, ctx);
    expect(hostGuessing.target).toBeNull();
    expect(hostGuessing.spotLabel).toBeNull();
    expect(hostGuessing.imageUrl).toBe(TEST_SPOT.imageUrl);
    expect(hostGuessing.lockedPlayerIds).toEqual([]);

    state = game.onPlayerAction(ctx, state, 'p1', {
      type: 'submit_guess',
      payload: { lat: 48.9, lng: 2.4 },
    }) ?? state;
    expect(state.phase).toBe('GUESSING');
    expect(game.getPlayerView(state, 'p1', ctx).lockedIn).toBe(true);
    expect(game.getHostView(state, ctx).lockedPlayerIds).toEqual(['p1']);

    state = game.onPlayerAction(ctx, state, 'p2', {
      type: 'submit_guess',
      payload: { lat: 35.6762, lng: 139.6503 },
    }) ?? state;
    expect(state.phase).toBe('GUESSING');

    state = game.onPlayerAction(ctx, state, 'p3', {
      type: 'submit_guess',
      payload: { lat: 51.5072, lng: -0.1276 },
    }) ?? state;

    expect(state.phase).toBe('REVEAL');
    expect(getTimer()).toEqual({ ms: REVEAL_DURATION_MS, showCountdown: false });
    expect(players.find((p) => p.id === 'p1')?.score).toBe(1);
    expect(players.find((p) => p.id === 'p2')?.score).toBe(0);
    expect(players.find((p) => p.id === 'p3')?.score).toBe(1);
    expect(events.some((e) => e.event === 'geoguess_reveal')).toBe(true);

    const hostReveal = game.getHostView(state, ctx);
    expect(hostReveal.winnerName).toBe('Alice');
    expect(hostReveal.drinkerNames).toEqual([]);
    expect(hostReveal.spotLabel).toBe('Paris, France');
    expect(hostReveal.target).toEqual(TEST_SPOT.coords);
    expect(hostReveal.players.find((p) => p.playerId === 'p1')?.roundPoints).toBe(1);

    const bobView = game.getPlayerView(state, 'p2', ctx);
    expect(bobView.drinks).toBe(false);
    expect(bobView.isWinner).toBe(false);

    const aliceView = game.getPlayerView(state, 'p1', ctx);
    expect(aliceView.isWinner).toBe(true);
    expect(aliceView.drinks).toBe(false);
    expect(aliceView.roundPoints).toBe(1);

    state = game.onTimerExpired!(ctx, state) ?? state;
    setState(state);
    expect(state.phase).toBe('LOADING');
    expect(state.round).toBe(2);
  });

  test('ends the game automatically after round 5 and lowest score drinks', async () => {
    const game = createGeoGuessGame(async () => TEST_SPOT);
    const { ctx, players, isEnded, setState } = makeContext([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);

    let state = game.onStart(ctx);
    setState(state);
    await Promise.resolve();

    for (let round = 1; round <= 5; round++) {
      state = game.onPlayerAction(ctx, state, 'p1', {
        type: 'submit_guess',
        payload: { lat: 48.8, lng: 2.3 },
      }) ?? state;
      state = game.onPlayerAction(ctx, state, 'p2', {
        type: 'submit_guess',
        payload: { lat: -33.8688, lng: 151.2093 },
      }) ?? state;
      expect(state.phase).toBe('REVEAL');

      if (round < 5) {
        expect(game.getHostView(state, ctx).drinkerNames).toEqual([]);
        state = game.onTimerExpired!(ctx, state) ?? state;
        setState(state);
        expect(state.phase).toBe('LOADING');
        await Promise.resolve();
      }
    }

    const aliceScore = players.find((p) => p.id === 'p1')!.score;
    const bobScore = players.find((p) => p.id === 'p2')!.score;
    expect(aliceScore).toBeGreaterThan(bobScore);

    const finalHost = game.getHostView(state, ctx);
    expect(finalHost.drinkerNames).toEqual(['Bob']);
    expect(game.getPlayerView(state, 'p2', ctx).drinks).toBe(true);
    expect(game.getPlayerView(state, 'p1', ctx).drinks).toBe(false);

    state = game.onTimerExpired!(ctx, state) ?? state;
    expect(isEnded()).toBe(true);
  });

  test('marks all tied worst non-guessers to drink on the final round', async () => {
    const game = createGeoGuessGame(async () => TEST_SPOT);
    const { ctx, setState } = makeContext([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Charlie' },
    ]);

    let state = game.onStart(ctx);
    setState(state);
    await Promise.resolve();

    for (let round = 1; round <= 5; round++) {
      state = game.onPlayerAction(ctx, state, 'p1', {
        type: 'submit_guess',
        payload: { lat: 48.8, lng: 2.3 },
      }) ?? state;
      state = game.onTimerExpired!(ctx, state) ?? state;
      expect(state.phase).toBe('REVEAL');
      if (round < 5) {
        state = game.onTimerExpired!(ctx, state) ?? state;
        setState(state);
        await Promise.resolve();
      }
    }

    expect(game.getHostView(state, ctx).drinkerNames).toEqual(['Bob', 'Charlie']);
    expect(game.getPlayerView(state, 'p1', ctx).drinks).toBe(false);
    expect(game.getPlayerView(state, 'p2', ctx).drinks).toBe(true);
    expect(game.getPlayerView(state, 'p3', ctx).drinks).toBe(true);
  });

  test('marks all players to drink when nobody guesses, unless all guess identically', async () => {
    const game = createGeoGuessGame(async () => TEST_SPOT);
    const noGuess = makeContext([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);

    let state = game.onStart(noGuess.ctx);
    noGuess.setState(state);
    await Promise.resolve();

    for (let round = 1; round <= 5; round++) {
      state = game.onTimerExpired!(noGuess.ctx, state) ?? state;
      expect(state.phase).toBe('REVEAL');
      if (round < 5) {
        state = game.onTimerExpired!(noGuess.ctx, state) ?? state;
        noGuess.setState(state);
        await Promise.resolve();
      }
    }

    expect(game.getHostView(state, noGuess.ctx).drinkerNames).toEqual(['Alice', 'Bob']);

    const tiedGuess = makeContext([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);
    let tiedState = game.onStart(tiedGuess.ctx);
    tiedGuess.setState(tiedState);
    await Promise.resolve();

    for (let round = 1; round <= 5; round++) {
      tiedState = game.onPlayerAction(tiedGuess.ctx, tiedState, 'p1', {
        type: 'submit_guess',
        payload: { lat: 48.8566, lng: 2.3522 },
      }) ?? tiedState;
      tiedState = game.onPlayerAction(tiedGuess.ctx, tiedState, 'p2', {
        type: 'submit_guess',
        payload: { lat: 48.8566, lng: 2.3522 },
      }) ?? tiedState;
      if (round < 5) {
        tiedState = game.onTimerExpired!(tiedGuess.ctx, tiedState) ?? tiedState;
        tiedGuess.setState(tiedState);
        await Promise.resolve();
      }
    }

    expect(game.getHostView(tiedState, tiedGuess.ctx).drinkerNames).toEqual([]);
  });
});
