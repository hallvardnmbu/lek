import { describe, expect, it } from 'bun:test';
import type { GameContext, GameDefinition } from '../game';
import type { PromptGenerator } from '../cortiModels';
import type {
  MostLikelyHostView,
  MostLikelyPlayerView,
  MostLikelyState,
} from '../../shared/games/mostlikely';
import { createMostLikelyGame } from './mostlikely';

type FullMostLikelyGame = Required<
  GameDefinition<MostLikelyState, MostLikelyHostView, MostLikelyPlayerView>
>;

function makeGame(generator: PromptGenerator): FullMostLikelyGame {
  return createMostLikelyGame(generator) as FullMostLikelyGame;
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

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

const twoPlayers: TestPlayer[] = [
  { id: 'p1', name: 'Alice', connected: true },
  { id: 'p2', name: 'Bob', connected: true },
];

describe('Most Likely To game', () => {
  it('runs generate -> vote -> reveal rounds and ends after totalRounds', async () => {
    const game = makeGame(async () => ['prompt a', 'prompt b', 'prompt c']);
    const { ctx, isEnded, score } = createTestCtx('room-lifecycle', twoPlayers);

    let state = game.onStart(ctx, { rounds: 3 });
    expect(state.phase).toBe('GENERATING');
    expect(state.totalRounds).toBe(3);

    await flush();

    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('VOTING');
    expect(state.round).toBe(1);
    expect(state.prompt).toBe('prompt a');
    expect(state.promptIsAi).toBe(true);

    state = game.onPlayerAction(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p2' } })!;
    expect(state.phase).toBe('VOTING');

    state = game.onPlayerAction(ctx, state, 'p2', { type: 'vote', payload: { targetId: 'p2' } })!;
    expect(state.phase).toBe('REVEAL');
    expect(score('p2')).toBe(1);
    expect(state.drinks.p2).toBe(1);
    expect(state.tally.find((t) => t.playerId === 'p2')?.isDrinker).toBe(true);

    const hostView = game.getHostView(state, ctx);
    expect(hostView.tally.filter((t) => t.isDrinker).map((t) => t.name)).toEqual(['Bob']);
    expect(hostView.votedCount).toBe(2);
    expect(hostView.connectedCount).toBe(2);

    const playerView = game.getPlayerView(state, 'p2', ctx);
    expect(playerView.iAmDrinking).toBe(true);
    expect(playerView.myDrinks).toBe(1);

    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('VOTING');
    expect(state.round).toBe(2);
    expect(state.prompt).toBe('prompt b');
    expect(state.votes).toEqual({});

    state = game.onHostAction(ctx, state, { type: 'next' })!;
    expect(state.phase).toBe('REVEAL');
    expect(score('p1')).toBe(0);
    expect(score('p2')).toBe(1);
    expect(state.drinks.p2).toBe(1);

    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('VOTING');
    expect(state.round).toBe(3);

    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('REVEAL');

    state = game.onTimerExpired(ctx, state)!;
    expect(isEnded()).toBe(true);
  });

  it('polls until prompts arrive and falls back to built-in prompts', async () => {
    const game = makeGame(
      () => new Promise<string[]>((resolve) => setTimeout(() => resolve(['late prompt']), 5))
    );
    const { ctx } = createTestCtx('room-poll', twoPlayers);

    let state = game.onStart(ctx, { rounds: 3 });
    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('GENERATING');

    await flush();
    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('VOTING');
    expect(state.prompt).toBe('late prompt');
    expect(state.promptIsAi).toBe(true);
  });

  it('uses fallback prompts when the generator fails', async () => {
    const game = makeGame(async () => []);
    const { ctx } = createTestCtx('room-fallback', twoPlayers);

    let state = game.onStart(ctx);
    expect(state.totalRounds).toBe(3);

    await flush();
    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('VOTING');
    expect(typeof state.prompt).toBe('string');
    expect(state.prompt!.length).toBeGreaterThan(0);
    expect(state.promptIsAi).toBe(false);
  });

  it('reveals on vote timer expiry with only partial votes', async () => {
    const game = makeGame(async () => ['prompt a']);
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Carol', connected: true },
    ];
    const { ctx, score } = createTestCtx('room-expiry', players);

    let state = game.onStart(ctx, { rounds: 3 });
    await flush();
    state = game.onTimerExpired(ctx, state)!;

    state = game.onPlayerAction(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p2' } })!;
    expect(state.phase).toBe('VOTING');

    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('REVEAL');
    expect(score('p2')).toBe(1);
    expect(state.drinks.p2).toBe(1);
    expect(state.drinkerIds).toEqual(['p2']);
  });

  it('ignores invalid targets, allows changing votes, and reveals when the last voter disconnects', async () => {
    const game = makeGame(async () => ['prompt a']);
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Carol', connected: true },
    ];
    const { ctx, score } = createTestCtx('room-votes', players);

    let state = game.onStart(ctx, { rounds: 3 });
    await flush();
    state = game.onTimerExpired(ctx, state)!;

    state = game.onPlayerAction(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'ghost' } })!;
    expect(state.votes).toEqual({});
    expect(state.phase).toBe('VOTING');

    state = game.onPlayerAction(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p1' } })!;
    state = game.onPlayerAction(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p2' } })!;
    expect(game.getPlayerView(state, 'p1', ctx).myVote).toBe('p2');

    state = game.onPlayerAction(ctx, state, 'p2', { type: 'vote', payload: { targetId: 'p2' } })!;
    expect(state.phase).toBe('VOTING');

    players[2].connected = false;
    state = game.onPlayerDisconnect(ctx, state, 'p3')!;
    expect(state.phase).toBe('REVEAL');
    expect(score('p2')).toBe(1);
    expect(state.drinks.p2).toBe(1);
  });

  it('awards all tied winners and caps score at 5 per game', async () => {
    const game = makeGame(async () => ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    const { ctx, score } = createTestCtx('room-cap', twoPlayers);

    let state = game.onStart(ctx, { rounds: 6 });
    await flush();
    state = game.onTimerExpired(ctx, state)!;

    state = game.onPlayerAction(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p1' } })!;
    state = game.onPlayerAction(ctx, state, 'p2', { type: 'vote', payload: { targetId: 'p2' } })!;
    expect(state.phase).toBe('REVEAL');
    expect(score('p1')).toBe(1);
    expect(score('p2')).toBe(1);

    for (let r = 2; r <= 6; r++) {
      state = game.onTimerExpired(ctx, state)!;
      state = game.onPlayerAction(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p1' } })!;
      state = game.onPlayerAction(ctx, state, 'p2', { type: 'vote', payload: { targetId: 'p1' } })!;
    }
    expect(score('p1')).toBe(5);
    expect(score('p2')).toBe(1);
  });

  it('removes a leaving player vote and reveals when everyone left has voted', async () => {
    const game = makeGame(async () => ['prompt a']);
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ];
    const { ctx } = createTestCtx('room-leave', players);

    let state = game.onStart(ctx, { rounds: 3 });
    await flush();
    state = game.onTimerExpired(ctx, state)!;

    state = game.onPlayerAction(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p2' } })!;
    state = game.onPlayerLeave(ctx, state, 'p2')!;
    expect(state.votes).toEqual({ p1: 'p2' });
    expect(state.phase).toBe('VOTING');

    players[1].connected = false;
    state = game.onPlayerDisconnect(ctx, state, 'p2')!;
    expect(state.phase).toBe('REVEAL');
  });

  it('never repeats a prompt within the same room across games', async () => {
    const game = makeGame(async () => ['same prompt', 'other prompt', 'third prompt']);
    const { ctx } = createTestCtx('room-dupes', [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);

    let state = game.onStart(ctx, { rounds: 3 });
    await flush();
    state = game.onTimerExpired(ctx, state)!;
    expect(state.prompt).toBe('same prompt');

    for (let round = 0; round < 3; round++) {
      state = game.onHostAction(ctx, state, { type: 'next' })!;
      state = game.onHostAction(ctx, state, { type: 'next' })!;
    }

    const secondGame = game.onStart(ctx, { rounds: 3 });
    await flush();
    const round1 = game.onTimerExpired(ctx, secondGame)!;
    expect(round1.promptIsAi).toBe(false);
    expect(round1.prompt).not.toBe('same prompt');
    expect(round1.prompt).not.toBe('other prompt');
    expect(round1.prompt).not.toBe('third prompt');
  });
});
