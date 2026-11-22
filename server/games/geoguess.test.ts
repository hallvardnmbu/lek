import { describe, expect, test } from 'bun:test';
import type { GameContext, GamePlayer } from '../game';
import { createGeoGuessGame, haversineKm } from './geoguess';
import type { GeoSpot } from './geoguess-spots';

function makeContext(playersInput: Array<{ id: string; name: string; connected?: boolean }>) {
  const players: GamePlayer[] = playersInput.map((p) => ({
    id: p.id,
    name: p.name,
    score: 0,
    connected: p.connected ?? true,
    meta: {},
  }));

  let timerCalls = 0;
  let cleared = 0;
  const events: Array<{ event: string; payload: unknown }> = [];

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
    setTimer: () => {
      timerCalls += 1;
    },
    clearTimer: () => {
      cleared += 1;
    },
    broadcastEvent: (event, payload) => {
      events.push({ event, payload });
    },
    sendEventToHost: () => {},
    sendEventToPlayer: () => {},
    emitWebhook: () => {},
    endGame: () => {},
  };

  return {
    ctx,
    players,
    getTimerCalls: () => timerCalls,
    getCleared: () => cleared,
    events,
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

  test('loads spot, accepts guesses, awards closest and marks furthest to drink', async () => {
    const game = createGeoGuessGame(async () => TEST_SPOT);
    const { ctx, players, events } = makeContext([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Charlie' },
    ]);

    let state = game.onStart(ctx);
    expect(state.phase).toBe('LOADING');

    await Promise.resolve();
    state = game.onTimerExpired!(ctx, state) ?? state;
    expect(state.phase).toBe('GUESSING');

    const hostGuessing = game.getHostView(state, ctx);
    expect(hostGuessing.target).toBeNull();
    expect(hostGuessing.spotLabel).toBeNull();
    expect(hostGuessing.imageUrl).toBe(TEST_SPOT.imageUrl);

    state = game.onPlayerAction(ctx, state, 'p1', {
      type: 'submit_guess',
      payload: { lat: 48.9, lng: 2.4 },
    }) ?? state;
    expect(state.phase).toBe('GUESSING');
    expect(game.getPlayerView(state, 'p1', ctx).lockedIn).toBe(true);

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
    expect(players.find((p) => p.id === 'p1')?.score).toBe(1);
    expect(events.some((e) => e.event === 'geoguess_reveal')).toBe(true);

    const hostReveal = game.getHostView(state, ctx);
    expect(hostReveal.winnerName).toBe('Alice');
    expect(hostReveal.drinkerName).toBe('Bob');
    expect(hostReveal.spotLabel).toBe('Paris, France');
    expect(hostReveal.target).toEqual(TEST_SPOT.coords);

    const bobView = game.getPlayerView(state, 'p2', ctx);
    expect(bobView.drinks).toBe(true);
    expect(bobView.isWinner).toBe(false);

    const aliceView = game.getPlayerView(state, 'p1', ctx);
    expect(aliceView.isWinner).toBe(true);
    expect(aliceView.drinks).toBe(false);
  });

  test('non-submitter drinks when timer expires', async () => {
    const game = createGeoGuessGame(async () => TEST_SPOT);
    const { ctx } = makeContext([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);

    let state = game.onStart(ctx);
    await Promise.resolve();
    state = game.onTimerExpired!(ctx, state) ?? state;

    state = game.onPlayerAction(ctx, state, 'p1', {
      type: 'submit_guess',
      payload: { lat: 10, lng: 10 },
    }) ?? state;

    state = game.onTimerExpired!(ctx, state) ?? state;
    expect(state.phase).toBe('REVEAL');

    const hostReveal = game.getHostView(state, ctx);
    expect(hostReveal.winnerName).toBe('Alice');
    expect(hostReveal.drinkerName).toBe('Bob');
  });

  test('host can advance to next round', async () => {
    const game = createGeoGuessGame(async () => TEST_SPOT);
    const { ctx } = makeContext([{ id: 'p1', name: 'Alice' }]);

    let state = game.onStart(ctx);
    await Promise.resolve();
    state = game.onTimerExpired!(ctx, state) ?? state;
    state = game.onPlayerAction(ctx, state, 'p1', {
      type: 'submit_guess',
      payload: { lat: 48.8, lng: 2.3 },
    }) ?? state;
    expect(state.phase).toBe('REVEAL');

    state = game.onHostAction!(ctx, state, { type: 'next_round' }) ?? state;
    expect(state.phase).toBe('LOADING');
    expect(state.round).toBe(2);
  });
});
