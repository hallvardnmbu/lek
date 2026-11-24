import { describe, expect, it } from 'bun:test';
import type { GameContext } from '../game';
import { REVEAL_DURATION_MS, TOTAL_ROUNDS, createPriceGuessGame } from './priceguess';
import type { PriceGuessProduct } from './priceguess-db';

const SAMPLE_PRODUCT: PriceGuessProduct = {
  id: '507f1f77bcf86cd799439011',
  name: 'Château Test 2020',
  category: 'Rødvin',
  subcategory: 'Bordeaux',
  country: 'Frankrike',
  district: 'Bordeaux',
  description: 'Fruktig og fyldig med smak av mørke bær.',
  alcohol: 13.5,
  year: 2020,
  imageUrl: 'https://example.com/bottle.jpg',
  price: 249.9,
};

function createTestCtx(players: Array<{ id: string; name: string; connected: boolean }>) {
  const scores: Record<string, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
  const events: Array<{ event: string; payload: unknown }> = [];
  let timer: { ms: number; showCountdown?: boolean } | null = null;
  let ended = false;
  let currentState: any;

  const toGamePlayers = () =>
    players.map((p) => ({
      id: p.id,
      name: p.name,
      score: scores[p.id] ?? 0,
      totalScore: scores[p.id] ?? 0,
      connected: p.connected,
      meta: {},
    }));

  const ctx: GameContext = {
    roomCode: 'price-test',
    getPlayers: () => toGamePlayers(),
    getPlayer: (id) => toGamePlayers().find((p) => p.id === id),
    setPlayerScore: (id, score) => {
      scores[id] = score;
    },
    addPlayerScore: (id, delta) => {
      scores[id] = (scores[id] ?? 0) + delta;
    },
    setPlayerMeta: () => {},
    setTimer: (ms, showCountdown) => {
      timer = { ms, showCountdown };
    },
    clearTimer: () => {
      timer = null;
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
    scores,
    events,
    setState: (s: unknown) => {
      currentState = s;
    },
    getTimer: () => timer,
    isEnded: () => ended,
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('priceguess game', () => {
  it('loads product, hides price while guessing, awards closest, marks furthest to drink and schedules reveal timer', async () => {
    const { ctx, scores, events, setState, getTimer } = createTestCtx([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);

    const game = createPriceGuessGame(async () => SAMPLE_PRODUCT);
    expect(game.onHostAction).toBeUndefined();

    let state = game.onStart(ctx);
    setState(state);
    expect(state.phase).toBe('LOADING');

    await flushMicrotasks();
    expect(state.phase).toBe('GUESSING');
    expect(game.getHostView(state, ctx).actualPrice).toBeNull();
    expect(game.getHostView(state, ctx).totalRounds).toBe(TOTAL_ROUNDS);
    expect(game.getPlayerView(state, 'p1', ctx).actualPrice).toBeNull();
    expect(game.getPlayerView(state, 'p1', ctx).totalRounds).toBe(TOTAL_ROUNDS);

    state = game.onPlayerAction(ctx, state, 'p1', {
      type: 'submit_guess',
      payload: { price: 240 },
    })!;
    expect(state.phase).toBe('GUESSING');
    expect(game.getHostView(state, ctx).lockedPlayerIds).toEqual(['p1']);

    state = game.onPlayerAction(ctx, state, 'p2', {
      type: 'submit_guess',
      payload: { price: 400 },
    })!;
    expect(state.phase).toBe('REVEAL');
    expect(getTimer()).toEqual({ ms: REVEAL_DURATION_MS, showCountdown: false });
    expect(scores.p1).toBe(2);
    expect(scores.p2).toBe(0);

    const hostView = game.getHostView(state, ctx);
    expect(hostView.actualPrice).toBe(249.9);
    expect(hostView.winnerNames).toEqual(['Alice']);
    expect(hostView.drinkerNames).toEqual(['Bob']);
    expect(hostView.drinkReason).toBe('furthest');
    expect(events.some((e) => e.event === 'priceguess_reveal')).toBe(true);
  });

  it('marks ALL non-submitters to drink when multiple or all players fail to guess', async () => {
    const multi = createTestCtx([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Charlie', connected: true },
    ]);

    const game = createPriceGuessGame(async () => SAMPLE_PRODUCT);
    let state = game.onStart(multi.ctx);
    multi.setState(state);
    await flushMicrotasks();

    state = game.onPlayerAction(multi.ctx, state, 'p1', {
      type: 'submit_guess',
      payload: { price: 250 },
    })!;
    state = game.onTimerExpired!(multi.ctx, state)!;

    expect(state.phase).toBe('REVEAL');
    const multiView = game.getHostView(state, multi.ctx);
    expect(multiView.winnerNames).toEqual(['Alice']);
    expect(multiView.drinkerNames).toEqual(['Bob', 'Charlie']);
    expect(multiView.drinkReason).toBe('no_guess');
    expect(game.getPlayerView(state, 'p2', multi.ctx).drinks).toBe(true);
    expect(game.getPlayerView(state, 'p3', multi.ctx).drinks).toBe(true);

    const none = createTestCtx([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Charlie', connected: true },
    ]);
    let noneState = game.onStart(none.ctx);
    none.setState(noneState);
    await flushMicrotasks();

    noneState = game.onTimerExpired!(none.ctx, noneState)!;
    expect(noneState.phase).toBe('REVEAL');
    const noneView = game.getHostView(noneState, none.ctx);
    expect(noneView.winnerNames).toEqual([]);
    expect(noneView.drinkerNames).toEqual(['Alice', 'Bob', 'Charlie']);
    expect(noneView.drinkReason).toBe('no_guess');
  });

  it('awards all tied closest players and spares everyone when all submit identical diff', async () => {
    const { ctx, scores, setState } = createTestCtx([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);

    const game = createPriceGuessGame(async () => SAMPLE_PRODUCT);
    let state = game.onStart(ctx);
    setState(state);
    await flushMicrotasks();

    state = game.onPlayerAction(ctx, state, 'p1', {
      type: 'submit_guess',
      payload: { price: 250 },
    })!;
    state = game.onPlayerAction(ctx, state, 'p2', {
      type: 'submit_guess',
      payload: { price: 250 },
    })!;

    expect(state.phase).toBe('REVEAL');
    expect(scores.p1).toBe(2);
    expect(scores.p2).toBe(2);
    const hostView = game.getHostView(state, ctx);
    expect(hostView.winnerNames).toEqual(['Alice', 'Bob']);
    expect(hostView.drinkerNames).toEqual([]);
    expect(hostView.drinkReason).toBeNull();
  });

  it('automatically progresses through 3 rounds via reveal timer and ends the game', async () => {
    let roundCalls = 0;
    const { ctx, setState, isEnded } = createTestCtx([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);

    const game = createPriceGuessGame(async (excludeIds) => {
      roundCalls += 1;
      return {
        ...SAMPLE_PRODUCT,
        id: `id-${roundCalls}`,
        name: `Bottle ${roundCalls} (excluded ${excludeIds.length})`,
      };
    });

    let state = game.onStart(ctx);
    setState(state);
    await flushMicrotasks();

    state = game.onPlayerAction(ctx, state, 'p1', {
      type: 'submit_guess',
      payload: { price: -10 },
    })!;
    expect(state.phase).toBe('GUESSING');

    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
      expect(state.round).toBe(round);
      state = game.onPlayerAction(ctx, state, 'p1', {
        type: 'submit_guess',
        payload: { price: 240 },
      })!;
      state = game.onPlayerAction(ctx, state, 'p2', {
        type: 'submit_guess',
        payload: { price: 320 },
      })!;
      expect(state.phase).toBe('REVEAL');

      state = game.onTimerExpired!(ctx, state)!;
      setState(state);
      if (round < TOTAL_ROUNDS) {
        expect(isEnded()).toBe(false);
        expect(state.phase).toBe('LOADING');
        await flushMicrotasks();
        expect(state.phase).toBe('GUESSING');
      }
    }

    expect(isEnded()).toBe(true);
    expect(roundCalls).toBe(3);
  });
});
