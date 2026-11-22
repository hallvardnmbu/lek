import { describe, expect, it } from 'bun:test';
import type { GameContext, GameDefinition } from '../game';
import type { PromptGenerator } from '../cortiModels';
import type {
  CategoriesHostView,
  CategoriesPlayerView,
  CategoriesState,
} from '../../shared/games/categories';
import { createCategoriesGame } from './categories';

type FullCategoriesGame = Required<
  GameDefinition<CategoriesState, CategoriesHostView, CategoriesPlayerView>
>;

function makeGame(generator: PromptGenerator): FullCategoriesGame {
  return createCategoriesGame(generator) as FullCategoriesGame;
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

  const toGamePlayers = () =>
    players.map((p) => ({
      id: p.id,
      name: p.name,
      score: scores.get(p.id) ?? 0,
      connected: p.connected,
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
    events,
    isEnded: () => ended,
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
  it('generates a category, stays untimed until players vote who failed, and continues via mobile or TV', async () => {
    const game = makeGame(async () => ['Pizza toppings', 'Car brands']);
    const { ctx, events, isEnded, score } = createTestCtx('cat-lifecycle', threePlayers);

    let state = game.onStart(ctx, { rounds: 2 });
    expect(state.phase).toBe('GENERATING');

    await flush();
    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('PLAYING');
    expect(state.round).toBe(1);
    expect(state.category).toBe('Pizza toppings');
    expect(state.categoryIsAi).toBe(true);

    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('PLAYING');

    state = game.onPlayerAction(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p2' } })!;
    state = game.onPlayerAction(ctx, state, 'p2', { type: 'vote', payload: { targetId: 'p2' } })!;
    expect(state.phase).toBe('PLAYING');

    state = game.onPlayerAction(ctx, state, 'p3', { type: 'vote', payload: { targetId: 'p2' } })!;
    expect(state.phase).toBe('REVEAL');
    expect(state.failedIds).toEqual(['p2']);
    expect(score('p1')).toBe(1);
    expect(score('p2')).toBe(0);
    expect(score('p3')).toBe(1);
    expect(events.some((e) => e.event === 'categories_reveal')).toBe(true);

    state = game.onPlayerAction(ctx, state, 'p1', { type: 'continue' })!;
    state = game.onPlayerAction(ctx, state, 'p2', { type: 'continue' })!;
    expect(state.phase).toBe('REVEAL');

    state = game.onPlayerAction(ctx, state, 'p3', { type: 'continue' })!;
    expect(state.phase).toBe('PLAYING');
    expect(state.round).toBe(2);
    expect(state.category).toBe('Car brands');

    state = game.onHostAction(ctx, state, { type: 'next' })!;
    expect(state.phase).toBe('REVEAL');
    expect(state.failedIds).toEqual([]);
    expect(score('p2')).toBe(0);

    state = game.onHostAction(ctx, state, { type: 'next' })!;
    expect(isEnded()).toBe(true);
  });

  it('uses fallback categories when AI returns empty and resolves on disconnect/leave', async () => {
    const game = makeGame(async () => []);
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Carol', connected: true },
    ];
    const { ctx } = createTestCtx('cat-disconnect', players);

    let state = game.onStart(ctx, { rounds: 1 });
    await flush();
    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('PLAYING');
    expect(state.categoryIsAi).toBe(false);
    expect(typeof state.category).toBe('string');

    state = game.onPlayerAction(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p3' } })!;
    state = game.onPlayerAction(ctx, state, 'p2', { type: 'vote', payload: { targetId: 'p3' } })!;
    expect(state.phase).toBe('PLAYING');

    players[2].connected = false;
    state = game.onPlayerDisconnect(ctx, state, 'p3')!;
    expect(state.phase).toBe('REVEAL');
    expect(state.failedIds).toEqual(['p3']);
  });

  it('never repeats a category within the same room across games', async () => {
    const game = makeGame(async () => ['Unique Category One', 'Unique Category Two']);
    const { ctx } = createTestCtx('cat-no-repeat', threePlayers);

    let s1 = game.onStart(ctx, { rounds: 1 });
    await flush();
    s1 = game.onTimerExpired(ctx, s1)!;
    const firstCategory = s1.category;

    let s2 = game.onStart(ctx, { rounds: 1 });
    await flush();
    s2 = game.onTimerExpired(ctx, s2)!;
    expect(s2.category).not.toBe(firstCategory);
  });
});
