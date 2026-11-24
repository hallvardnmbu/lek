import { describe, expect, it } from 'bun:test';
import type { GameContext, GameDefinition } from '../game';
import type { PromptGenerator } from '../cortiModels';
import type {
  MostLikelyHostView,
  MostLikelyPlayerView,
} from '../../shared/games/mostlikely';
import { createMostLikelyGame, type MostLikelyState } from './mostlikely';

type MostLikelyGameDef = GameDefinition<
  MostLikelyState,
  MostLikelyHostView,
  MostLikelyPlayerView
>;

function makeGame(generator: PromptGenerator): MostLikelyGameDef {
  return createMostLikelyGame(generator);
}

interface TestPlayer {
  id: string;
  name: string;
  connected: boolean;
}

function createTestCtx(roomCode: string, players: TestPlayer[]) {
  const scores = new Map<string, number>();
  let ended = false;
  let timerSetCount = 0;
  let currentState: MostLikelyState;

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
      if (next !== undefined) currentState = next as MostLikelyState;
    },
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
    bindState: (s: MostLikelyState) => {
      currentState = s;
      return s;
    },
    getState: () => currentState,
    isEnded: () => ended,
    timerCalls: () => timerSetCount,
    score: (id: string) => scores.get(id) ?? 0,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

const twoPlayers: TestPlayer[] = [
  { id: 'p1', name: 'Alice', connected: true },
  { id: 'p2', name: 'Bob', connected: true },
];

describe('Most Likely To game', () => {
  it('runs 3 untimed vote -> reveal -> continue rounds and ends after round 3', async () => {
    const game = makeGame(async () => ['prompt a', 'prompt b', 'prompt c']);
    const { ctx, bindState, getState, isEnded, timerCalls, score } = createTestCtx(
      'room-lifecycle',
      twoPlayers
    );

    expect(game.onTimerExpired).toBeUndefined();
    expect(game.onHostAction).toBeUndefined();

    let state = bindState(game.onStart(ctx));
    expect(state.phase).toBe('GENERATING');
    expect(state.totalRounds).toBe(3);

    await flush();
    state = getState();
    expect(state.phase).toBe('VOTING');
    expect(state.round).toBe(1);
    expect(state.prompt).toBe('prompt a');
    expect(state.promptIsAi).toBe(true);

    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p2' } })!;
    expect(state.phase).toBe('VOTING');
    expect(game.getHostView(state, ctx).votedPlayerIds).toEqual(['p1']);

    state = game.onPlayerAction!(ctx, state, 'p2', { type: 'vote', payload: { targetId: 'p2' } })!;
    expect(state.phase).toBe('REVEAL');
    expect(score('p2')).toBe(1);
    expect(state.drinks.p2).toBe(1);
    expect(state.tally.find((t) => t.playerId === 'p2')?.isDrinker).toBe(true);

    const hostView = game.getHostView(state, ctx);
    expect(hostView.tally.filter((t) => t.isDrinker).map((t) => t.name)).toEqual(['Bob']);
    expect(hostView.votedPlayerIds).toEqual(['p1', 'p2']);
    expect(hostView.continuePlayerIds).toEqual([]);

    const playerView = game.getPlayerView(state, 'p2', ctx);
    expect(playerView.iAmDrinking).toBe(true);
    expect(playerView.myDrinks).toBe(1);
    expect(playerView.myContinueVote).toBe(false);

    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'continue' })!;
    expect(state.phase).toBe('REVEAL');
    expect(game.getHostView(state, ctx).continuePlayerIds).toEqual(['p1']);
    expect(game.getPlayerView(state, 'p1', ctx).myContinueVote).toBe(true);
    expect(game.getPlayerView(state, 'p1', ctx).continueCount).toBe(1);

    state = game.onPlayerAction!(ctx, state, 'p2', { type: 'continue' })!;
    expect(state.phase).toBe('VOTING');
    expect(state.round).toBe(2);
    expect(state.prompt).toBe('prompt b');
    expect(state.votes).toEqual({});
    expect(state.continueVotes).toEqual({});

    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p1' } })!;
    state = game.onPlayerAction!(ctx, state, 'p2', { type: 'vote', payload: { targetId: 'p1' } })!;
    expect(state.phase).toBe('REVEAL');
    expect(score('p1')).toBe(1);

    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'continue' })!;
    state = game.onPlayerAction!(ctx, state, 'p2', { type: 'continue' })!;
    expect(state.phase).toBe('VOTING');
    expect(state.round).toBe(3);
    expect(state.prompt).toBe('prompt c');

    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p2' } })!;
    state = game.onPlayerAction!(ctx, state, 'p2', { type: 'vote', payload: { targetId: 'p2' } })!;
    expect(state.phase).toBe('REVEAL');
    expect(isEnded()).toBe(false);

    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'continue' })!;
    expect(isEnded()).toBe(false);

    state = game.onPlayerAction!(ctx, state, 'p2', { type: 'continue' })!;
    expect(isEnded()).toBe(true);
    expect(timerCalls()).toBe(0);
  });

  it('dispatches round start when prompts arrive asynchronously', async () => {
    const game = makeGame(
      () => new Promise<string[]>((resolve) => setTimeout(() => resolve(['late prompt']), 5))
    );
    const { ctx, bindState, getState } = createTestCtx('room-poll', twoPlayers);

    let state = bindState(game.onStart(ctx));
    expect(state.phase).toBe('GENERATING');

    await flush();
    state = getState();
    expect(state.phase).toBe('VOTING');
    expect(state.prompt).toBe('late prompt');
    expect(state.promptIsAi).toBe(true);
  });

  it('uses fallback prompts when the generator fails or rejects', async () => {
    const emptyGame = makeGame(async () => []);
    const emptyCtx = createTestCtx('room-fallback', twoPlayers);

    emptyCtx.bindState(emptyGame.onStart(emptyCtx.ctx));
    expect(emptyCtx.getState().totalRounds).toBe(3);

    await flush();
    const emptyState = emptyCtx.getState();
    expect(emptyState.phase).toBe('VOTING');
    expect(typeof emptyState.prompt).toBe('string');
    expect(emptyState.prompt!.length).toBeGreaterThan(0);
    expect(emptyState.promptIsAi).toBe(false);

    const rejectGame = makeGame(async () => {
      throw new Error('boom');
    });
    const rejectCtx = createTestCtx('room-reject', twoPlayers);
    rejectCtx.bindState(rejectGame.onStart(rejectCtx.ctx));
    await flush();
    expect(rejectCtx.getState().phase).toBe('VOTING');
    expect(rejectCtx.getState().promptIsAi).toBe(false);
  });

  it('ignores invalid targets, allows changing votes, and advances on disconnect in VOTING and REVEAL', async () => {
    const game = makeGame(async () => ['prompt a', 'prompt b']);
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Carol', connected: true },
    ];
    const { ctx, bindState, getState, score } = createTestCtx('room-votes', players);

    let state = bindState(game.onStart(ctx));
    await flush();
    state = getState();

    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'ghost' } })!;
    expect(state.votes).toEqual({});
    expect(state.phase).toBe('VOTING');

    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p1' } })!;
    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p2' } })!;
    expect(game.getPlayerView(state, 'p1', ctx).myVote).toBe('p2');

    state = game.onPlayerAction!(ctx, state, 'p2', { type: 'vote', payload: { targetId: 'p2' } })!;
    expect(state.phase).toBe('VOTING');

    players[2].connected = false;
    state = game.onPlayerDisconnect!(ctx, state, 'p3')!;
    expect(state.phase).toBe('REVEAL');
    expect(score('p2')).toBe(1);
    expect(state.drinks.p2).toBe(1);

    players[2].connected = true;
    state = game.onPlayerReconnect!(ctx, state, 'p3')!;
    expect(state.phase).toBe('REVEAL');

    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'continue' })!;
    state = game.onPlayerAction!(ctx, state, 'p2', { type: 'continue' })!;
    expect(state.phase).toBe('REVEAL');

    players[2].connected = false;
    state = game.onPlayerDisconnect!(ctx, state, 'p3')!;
    expect(state.phase).toBe('VOTING');
    expect(state.round).toBe(2);
  });

  it('awards all tied winners and caps score at 5 per game', async () => {
    const game = makeGame(async () => ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    const { ctx, bindState, getState, score } = createTestCtx('room-cap', twoPlayers);

    let state = bindState(game.onStart(ctx, { rounds: 6 }));
    await flush();
    state = getState();

    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p1' } })!;
    state = game.onPlayerAction!(ctx, state, 'p2', { type: 'vote', payload: { targetId: 'p2' } })!;
    expect(state.phase).toBe('REVEAL');
    expect(score('p1')).toBe(1);
    expect(score('p2')).toBe(1);

    for (let r = 2; r <= 6; r++) {
      state = game.onPlayerAction!(ctx, state, 'p1', { type: 'continue' })!;
      state = game.onPlayerAction!(ctx, state, 'p2', { type: 'continue' })!;
      state = game.onPlayerAction!(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p1' } })!;
      state = game.onPlayerAction!(ctx, state, 'p2', { type: 'vote', payload: { targetId: 'p1' } })!;
    }
    expect(score('p1')).toBe(5);
    expect(score('p2')).toBe(1);
  });

  it('removes a leaving player vote and continue vote and advances when everyone left has acted', async () => {
    const game = makeGame(async () => ['prompt a', 'prompt b']);
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ];
    const { ctx, bindState, getState } = createTestCtx('room-leave', players);

    let state = bindState(game.onStart(ctx));
    await flush();
    state = getState();

    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p2' } })!;
    players.splice(1, 1);
    state = game.onPlayerLeave!(ctx, state, 'p2')!;
    expect(state.phase).toBe('REVEAL');

    players.push({ id: 'p3', name: 'Carol', connected: true });
    state = game.onPlayerAction!(ctx, state, 'p1', { type: 'continue' })!;
    expect(state.phase).toBe('REVEAL');

    players.splice(1, 1);
    state = game.onPlayerLeave!(ctx, state, 'p3')!;
    expect(state.phase).toBe('VOTING');
    expect(state.round).toBe(2);
  });

  it('never repeats a prompt within the same room across games', async () => {
    const game = makeGame(async () => ['same prompt', 'other prompt', 'third prompt']);
    const { ctx, bindState, getState } = createTestCtx('room-dupes', [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);

    let state = bindState(game.onStart(ctx));
    await flush();
    state = getState();
    expect(state.prompt).toBe('same prompt');

    for (let round = 0; round < 3; round++) {
      state = game.onPlayerAction!(ctx, state, 'p1', { type: 'vote', payload: { targetId: 'p1' } })!;
      state = game.onPlayerAction!(ctx, state, 'p2', { type: 'vote', payload: { targetId: 'p1' } })!;
      state = game.onPlayerAction!(ctx, state, 'p1', { type: 'continue' })!;
      state = game.onPlayerAction!(ctx, state, 'p2', { type: 'continue' })!;
    }

    bindState(game.onStart(ctx));
    await flush();
    const round1 = getState();
    expect(round1.promptIsAi).toBe(false);
    expect(round1.prompt).not.toBe('same prompt');
    expect(round1.prompt).not.toBe('other prompt');
    expect(round1.prompt).not.toBe('third prompt');
  });
});
