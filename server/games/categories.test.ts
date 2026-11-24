import { describe, expect, it } from 'bun:test';
import type { GameContext, GameDefinition } from '../game';
import type { PromptGenerator } from '../cortiModels';
import type {
  CategoriesHostView,
  CategoriesPlayerView,
} from '../../shared/games/categories';
import { createCategoriesGame, type CategoriesState } from './categories';

type FullCategoriesGame = GameDefinition<CategoriesState, CategoriesHostView, CategoriesPlayerView>;

function makeGame(generator: PromptGenerator): FullCategoriesGame {
  return createCategoriesGame(generator);
}

interface TestPlayer {
  id: string;
  name: string;
  connected: boolean;
}

function createTestCtx(roomCode: string, players: TestPlayer[]) {
  const scores = new Map<string, number>();
  const events: Array<{ event: string; payload: unknown }> = [];
  let ended = false;
  let timerSetCount = 0;
  let currentState: CategoriesState;

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
    setTimer: () => {
      timerSetCount += 1;
    },
    clearTimer: () => {},
    dispatch: (fn) => {
      const next = fn(currentState as never);
      if (next !== undefined) currentState = next as CategoriesState;
    },
    broadcastEvent: (event, payload) => events.push({ event, payload }),
    sendEventToHost: () => {},
    sendEventToPlayer: () => {},
    emitWebhook: () => {},
    endGame: () => {
      ended = true;
    },
  };

  return {
    ctx,
    bindState: (s: CategoriesState) => {
      currentState = s;
      return s;
    },
    getState: () => currentState,
    events,
    isEnded: () => ended,
    timerCalls: () => timerSetCount,
    score: (id: string) => scores.get(id) ?? 0,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

const threePlayers: TestPlayer[] = [
  { id: 'p1', name: 'Alice', connected: true },
  { id: 'p2', name: 'Bob', connected: true },
  { id: 'p3', name: 'Carol', connected: true },
];

describe('Categories game', () => {
  it('runs 3 untimed vote -> reveal -> continue rounds and ends after round 3', async () => {
    const game = makeGame(async () => ['Pizza toppings', 'Car brands', 'Dog breeds']);
    const { ctx, bindState, getState, events, isEnded, timerCalls, score } = createTestCtx(
      'cat-lifecycle',
      threePlayers
    );

    expect(game.onTimerExpired).toBeUndefined();
    expect(game.onHostAction).toBeUndefined();

    let state = bindState(game.onStart(ctx));
    expect(state.phase).toBe('GENERATING');
    expect(state.totalRounds).toBe(3);

    await flush();
    state = getState();
    expect(state.phase).toBe('PLAYING');
    expect(state.round).toBe(1);
    expect(state.category).toBe('Pizza toppings');
    expect(state.categoryIsAi).toBe(true);

    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p2' } })!;
    state = game.onPlayerAction!(ctx, state, 'p2', { type: 'vote', payload: { targetId: 'p2' } })!;
    expect(state.phase).toBe('PLAYING');
    expect(game.getHostView(state, ctx).votedPlayerIds).toEqual(['p1', 'p2']);

    state = game.onPlayerAction!(ctx, state, 'p3', { type: 'vote', payload: { targetId: 'p2' } })!;
    expect(state.phase).toBe('REVEAL');
    expect(state.failedIds).toEqual(['p2']);
    expect(score('p1')).toBe(1);
    expect(score('p2')).toBe(0);
    expect(score('p3')).toBe(1);
    expect(events.some((e) => e.event === 'categories_reveal')).toBe(true);
    expect(game.getHostView(state, ctx).votedPlayerIds).toEqual(['p1', 'p2', 'p3']);
    expect(game.getHostView(state, ctx).continuePlayerIds).toEqual([]);

    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'continue' })!;
    state = game.onPlayerAction!(ctx, state, 'p2', { type: 'continue' })!;
    expect(state.phase).toBe('REVEAL');
    expect(game.getHostView(state, ctx).continuePlayerIds).toEqual(['p1', 'p2']);

    state = game.onPlayerAction!(ctx, state, 'p3', { type: 'continue' })!;
    expect(state.phase).toBe('PLAYING');
    expect(state.round).toBe(2);
    expect(state.category).toBe('Car brands');

    for (const pid of ['p1', 'p2', 'p3']) {
      state = game.onPlayerAction!(ctx, state, pid, { type: 'vote', payload: { targetId: 'p1' } })!;
    }
    expect(state.phase).toBe('REVEAL');
    expect(score('p1')).toBe(1);
    expect(score('p2')).toBe(1);
    expect(score('p3')).toBe(2);

    for (const pid of ['p1', 'p2', 'p3']) {
      state = game.onPlayerAction!(ctx, state, pid, { type: 'continue' })!;
    }
    expect(state.phase).toBe('PLAYING');
    expect(state.round).toBe(3);
    expect(state.category).toBe('Dog breeds');

    for (const pid of ['p1', 'p2', 'p3']) {
      state = game.onPlayerAction!(ctx, state, pid, { type: 'vote', payload: { targetId: 'p3' } })!;
    }
    expect(state.phase).toBe('REVEAL');
    expect(isEnded()).toBe(false);

    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'continue' })!;
    state = game.onPlayerAction!(ctx, state, 'p2', { type: 'continue' })!;
    expect(isEnded()).toBe(false);

    state = game.onPlayerAction!(ctx, state, 'p3', { type: 'continue' })!;
    expect(isEnded()).toBe(true);
    expect(timerCalls()).toBe(0);
  });

  it('uses fallback categories when AI returns empty or rejects and resolves on disconnect/leave', async () => {
    const game = makeGame(async () => []);
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Carol', connected: true },
    ];
    const { ctx, bindState, getState, isEnded } = createTestCtx('cat-disconnect', players);

    let state = bindState(game.onStart(ctx, { rounds: 1 }));
    await flush();
    state = getState();
    expect(state.phase).toBe('PLAYING');
    expect(state.categoryIsAi).toBe(false);
    expect(typeof state.category).toBe('string');

    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p3' } })!;
    state = game.onPlayerAction!(ctx, state, 'p2', { type: 'vote', payload: { targetId: 'p3' } })!;
    expect(state.phase).toBe('PLAYING');

    players[2].connected = false;
    state = game.onPlayerDisconnect!(ctx, state, 'p3')!;
    expect(state.phase).toBe('REVEAL');
    expect(state.failedIds).toEqual(['p3']);

    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'continue' })!;
    expect(isEnded()).toBe(false);

    players.splice(1, 1);
    state = game.onPlayerLeave!(ctx, state, 'p2')!;
    expect(isEnded()).toBe(true);

    const rejectGame = makeGame(async () => {
      throw new Error('boom');
    });
    const rejectCtx = createTestCtx('cat-reject', threePlayers);
    rejectCtx.bindState(rejectGame.onStart(rejectCtx.ctx, { rounds: 1 }));
    await flush();
    expect(rejectCtx.getState().phase).toBe('PLAYING');
    expect(rejectCtx.getState().categoryIsAi).toBe(false);
  });

  it('never repeats a category within the same room across games', async () => {
    const game = makeGame(async () => ['Unique Category One', 'Unique Category Two']);
    const { ctx, bindState, getState } = createTestCtx('cat-no-repeat', threePlayers);

    bindState(game.onStart(ctx, { rounds: 1 }));
    await flush();
    const firstCategory = getState().category;

    bindState(game.onStart(ctx, { rounds: 1 }));
    await flush();
    expect(getState().category).not.toBe(firstCategory);
  });
});
