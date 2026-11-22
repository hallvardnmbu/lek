import { describe, expect, it } from 'bun:test';
import type { GameContext } from '../game';
import { createPriceGuessGame } from './priceguess';
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
  let timerMs: number | null = null;

  const toGamePlayers = () =>
    players.map((p) => ({
      id: p.id,
      name: p.name,
      score: scores[p.id] ?? 0,
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
    setTimer: (ms) => {
      timerMs = ms;
    },
    clearTimer: () => {
      timerMs = null;
    },
    broadcastEvent: (event, payload) => {
      events.push({ event, payload });
    },
    sendEventToHost: () => {},
    sendEventToPlayer: () => {},
    emitWebhook: () => {},
    endGame: () => {},
  };

  return { ctx, scores, events, getTimer: () => timerMs };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('priceguess game', () => {
  it('loads product, hides price while guessing, awards closest and marks furthest to drink', async () => {
    const { ctx, scores, events } = createTestCtx([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);

    const game = createPriceGuessGame(async () => SAMPLE_PRODUCT);
    let state = game.onStart(ctx);
    expect(state.phase).toBe('LOADING');

    await flushMicrotasks();
    state = game.onTimerExpired!(ctx, state)!;
    expect(state.phase).toBe('GUESSING');
    expect(game.getHostView(state, ctx).actualPrice).toBeNull();
    expect(game.getPlayerView(state, 'p1', ctx).actualPrice).toBeNull();

    state = game.onPlayerAction(ctx, state, 'p1', {
      type: 'submit_guess',
      payload: { price: 240 },
    })!;
    expect(state.phase).toBe('GUESSING');

    state = game.onPlayerAction(ctx, state, 'p2', {
      type: 'submit_guess',
      payload: { price: 400 },
    })!;
    expect(state.phase).toBe('REVEAL');
    expect(scores.p1).toBe(1);
    expect(scores.p2).toBe(0);

    const hostView = game.getHostView(state, ctx);
    expect(hostView.actualPrice).toBe(249.9);
    expect(hostView.winnerName).toBe('Alice');
    expect(hostView.drinkerName).toBe('Bob');
    expect(events.some((e) => e.event === 'priceguess_reveal')).toBe(true);
  });

  it('marks non-submitter to drink when timer expires', async () => {
    const { ctx } = createTestCtx([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);

    const game = createPriceGuessGame(async () => SAMPLE_PRODUCT);
    let state = game.onStart(ctx);
    await flushMicrotasks();
    state = game.onTimerExpired!(ctx, state)!;

    state = game.onPlayerAction(ctx, state, 'p1', {
      type: 'submit_guess',
      payload: { price: 250 },
    })!;
    state = game.onTimerExpired!(ctx, state)!;

    expect(state.phase).toBe('REVEAL');
    const hostView = game.getHostView(state, ctx);
    expect(hostView.winnerName).toBe('Alice');
    expect(hostView.drinkerName).toBe('Bob');
  });

  it('ignores invalid guesses and advances on next_round', async () => {
    let roundCalls = 0;
    const { ctx } = createTestCtx([{ id: 'p1', name: 'Alice', connected: true }]);

    const game = createPriceGuessGame(async (excludeIds) => {
      roundCalls += 1;
      return {
        ...SAMPLE_PRODUCT,
        id: `id-${roundCalls}`,
        name: `Bottle ${roundCalls} (excluded ${excludeIds.length})`,
      };
    });

    let state = game.onStart(ctx);
    await flushMicrotasks();
    state = game.onTimerExpired!(ctx, state)!;

    state = game.onPlayerAction(ctx, state, 'p1', {
      type: 'submit_guess',
      payload: { price: -10 },
    })!;
    expect(state.phase).toBe('GUESSING');

    state = game.onPlayerAction(ctx, state, 'p1', {
      type: 'submit_guess',
      payload: { price: 200 },
    })!;
    expect(state.phase).toBe('REVEAL');

    state = game.onHostAction!(ctx, state, { type: 'next_round' })!;
    expect(state.phase).toBe('LOADING');
    expect(state.round).toBe(2);
    await flushMicrotasks();
    state = game.onTimerExpired!(ctx, state)!;
    expect(state.phase).toBe('GUESSING');
    expect(game.getHostView(state, ctx).product?.name).toBe('Bottle 2 (excluded 1)');
  });
});
