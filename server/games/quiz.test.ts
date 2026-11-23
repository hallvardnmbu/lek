import { describe, expect, it } from 'bun:test';
import type { GameContext, GameDefinition } from '../game';
import type { QuizHostView, QuizPlayerView, QuizQuestion } from '../../shared/games/quiz';
import type { QuestionGenerator, QuizState } from './quiz';
import { createQuizGame, FALLBACK_QUESTIONS } from './quiz';

type FullQuizGame = Required<GameDefinition<QuizState, QuizHostView, QuizPlayerView>>;

interface TestPlayer {
  id: string;
  name: string;
  connected: boolean;
}

function createTestCtx(roomCode: string, players: TestPlayer[]) {
  const scores = new Map<string, number>();
  let ended = false;
  let currentState: QuizState;

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
    dispatch: (fn) => {
      const next = fn(currentState as never);
      if (next !== undefined) currentState = next as QuizState;
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
    bindState: (s: QuizState) => {
      currentState = s;
      return s;
    },
    getState: () => currentState,
    isEnded: () => ended,
    score: (id: string) => scores.get(id) ?? 0,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

function makeQuestions(count: number, prefix: string): QuizQuestion[] {
  return Array.from({ length: count }, (_, i) => ({
    question: `${prefix} ${i + 1}`,
    options: ['correct', 'wrong b', 'wrong c', 'wrong d'],
    correctIndex: 0,
  }));
}

function answer(game: FullQuizGame, ctx: GameContext, state: QuizState, playerId: string, optionIndex: number): QuizState {
  return game.onPlayerAction(ctx, state, playerId, {
    type: 'answer',
    payload: { optionIndex },
  })!;
}

describe('Quiz game', () => {
  it('eliminates wrong players, spares everyone when all are wrong, and crowns the last player', async () => {
    const game = createQuizGame(async () => makeQuestions(10, 'q')) as FullQuizGame;
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Carol', connected: true },
    ];
    const { ctx, bindState, getState, isEnded, score } = createTestCtx('quiz-lifecycle', players);

    let state = bindState(game.onStart(ctx)!);
    expect(state.phase).toBe('GENERATING');
    expect(state.aliveIds).toEqual(['p1', 'p2', 'p3']);

    await flush();
    state = getState();
    expect(state.phase).toBe('QUESTION');
    expect(state.questionNumber).toBe(1);

    state = answer(game, ctx, state, 'p1', 0);
    state = answer(game, ctx, state, 'p2', 1);
    state = answer(game, ctx, state, 'p3', 0);
    expect(state.phase).toBe('REVEAL');
    expect(state.aliveIds).toEqual(['p1', 'p3']);
    expect(score('p1')).toBe(1);
    expect(score('p3')).toBe(1);
    expect(game.getPlayerView(state, 'p2', ctx).iWasEliminated).toBe(true);

    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('QUESTION');
    expect(state.questionNumber).toBe(2);

    state = answer(game, ctx, state, 'p1', 1);
    state = answer(game, ctx, state, 'p3', 1);
    expect(state.phase).toBe('REVEAL');
    expect(state.allWrong).toBe(true);
    expect(state.aliveIds).toEqual(['p1', 'p3']);
    expect(game.getHostView(state, ctx).allWrong).toBe(true);

    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('QUESTION');
    expect(state.questionNumber).toBe(3);

    state = answer(game, ctx, state, 'p1', 0);
    state = answer(game, ctx, state, 'p3', 1);
    expect(state.phase).toBe('REVEAL');
    expect(state.aliveIds).toEqual(['p1']);
    expect(game.getHostView(state, ctx).winnerName).toBe('Alice');

    state = game.onTimerExpired(ctx, state)!;
    expect(isEnded()).toBe(true);
    expect(score('p1')).toBe(1 + 1 + 2);
  });

  it('eliminates multiple wrong players in the same round', async () => {
    const game = createQuizGame(async () => makeQuestions(10, 'q')) as FullQuizGame;
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Carol', connected: true },
      { id: 'p4', name: 'Dave', connected: true },
    ];
    const { ctx, bindState, getState } = createTestCtx('quiz-multi-out', players);

    let state = bindState(game.onStart(ctx)!);
    await flush();
    state = getState();

    state = answer(game, ctx, state, 'p1', 0);
    state = answer(game, ctx, state, 'p2', 1);
    state = answer(game, ctx, state, 'p3', 2);
    state = answer(game, ctx, state, 'p4', 0);

    expect(state.phase).toBe('REVEAL');
    expect(state.aliveIds).toEqual(['p1', 'p4']);
    const hostView = game.getHostView(state, ctx);
    expect(hostView.results.filter((r) => r.eliminated).map((r) => r.playerName)).toEqual(['Bob', 'Carol']);
  });

  it('counts unanswered players as wrong when the timer expires', async () => {
    const game = createQuizGame(async () => makeQuestions(10, 'q')) as FullQuizGame;
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Carol', connected: true },
    ];
    const { ctx, bindState, getState, isEnded, score } = createTestCtx('quiz-timeout', players);

    let state = bindState(game.onStart(ctx)!);
    await flush();
    state = getState();

    state = answer(game, ctx, state, 'p1', 0);
    state = answer(game, ctx, state, 'p2', 1);
    state = game.onTimerExpired(ctx, state)!;

    expect(state.phase).toBe('REVEAL');
    expect(state.aliveIds).toEqual(['p1']);
    expect(game.getHostView(state, ctx).winnerName).toBe('Alice');

    state = game.onTimerExpired(ctx, state)!;
    expect(isEnded()).toBe(true);
    expect(score('p1')).toBe(1 + 2);
  });

  it('locks answers, ignores invalid answers, and ignores eliminated players', async () => {
    const game = createQuizGame(async () => makeQuestions(10, 'q')) as FullQuizGame;
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Carol', connected: true },
    ];
    const { ctx, bindState, getState } = createTestCtx('quiz-answers', players);

    let state = bindState(game.onStart(ctx)!);
    await flush();
    state = getState();

    state = answer(game, ctx, state, 'p1', 0);
    expect(state.answers.p1.optionIndex).toBe(0);

    state = answer(game, ctx, state, 'p1', 2);
    expect(state.answers.p1.optionIndex).toBe(0);

    state = answer(game, ctx, state, 'p2', 99);
    expect(state.answers.p2).toBeUndefined();
    expect(state.phase).toBe('QUESTION');

    state = answer(game, ctx, state, 'p2', 1);
    state = answer(game, ctx, state, 'p3', 0);
    expect(state.aliveIds).toEqual(['p1', 'p3']);

    state = game.onTimerExpired(ctx, state)!;
    expect(state.phase).toBe('QUESTION');

    state = answer(game, ctx, state, 'p2', 0);
    expect(state.answers.p2).toBeUndefined();
    expect(state.aliveIds).toEqual(['p1', 'p3']);
  });

  it('prefetches a new batch when players reach the prefetch question', async () => {
    let calls = 0;
    const generator: QuestionGenerator = async (count) => {
      calls += 1;
      return makeQuestions(count, `batch${calls}`);
    };
    const game = createQuizGame(generator) as FullQuizGame;
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Carol', connected: true },
    ];
    const { ctx, bindState, getState } = createTestCtx('quiz-prefetch', players);

    let state = bindState(game.onStart(ctx)!);
    await flush();
    state = getState();
    expect(calls).toBe(1);

    for (let round = 1; round <= 7; round++) {
      state = answer(game, ctx, state, 'p1', 0);
      state = answer(game, ctx, state, 'p2', 0);
      state = answer(game, ctx, state, 'p3', 0);
      state = game.onTimerExpired(ctx, state)!;
    }

    expect(state.phase).toBe('QUESTION');
    expect(state.questionNumber).toBe(8);
    expect(state.pendingBatch).toBe(true);
    expect(calls).toBe(2);

    await flush();
    expect(state.pendingBatch).toBe(false);
    expect(state.aiQuestions.length).toBe(12);

    state = answer(game, ctx, state, 'p1', 0);
    state = answer(game, ctx, state, 'p2', 0);
    state = answer(game, ctx, state, 'p3', 0);
    state = game.onTimerExpired(ctx, state)!;
    expect(state.questionNumber).toBe(9);

    state = answer(game, ctx, state, 'p1', 0);
    state = answer(game, ctx, state, 'p2', 0);
    state = answer(game, ctx, state, 'p3', 0);
    state = game.onTimerExpired(ctx, state)!;
    expect(state.questionNumber).toBe(10);

    state = answer(game, ctx, state, 'p1', 0);
    state = answer(game, ctx, state, 'p2', 0);
    state = answer(game, ctx, state, 'p3', 0);
    state = game.onTimerExpired(ctx, state)!;
    expect(state.questionNumber).toBe(11);
    expect(state.questions[10].question).toBe('batch2 1');
  });

  it('dispatches question 1 when the first batch arrives asynchronously', async () => {
    const game = createQuizGame(
      () => new Promise<QuizQuestion[]>((resolve) => setTimeout(() => resolve(makeQuestions(10, 'q')), 5))
    ) as FullQuizGame;
    const { ctx, bindState, getState } = createTestCtx('quiz-poll', [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);

    let state = bindState(game.onStart(ctx)!);
    expect(state.phase).toBe('GENERATING');

    await flush();
    state = getState();
    expect(state.phase).toBe('QUESTION');
    expect(state.questionNumber).toBe(1);
    expect(state.questions[0].question).toBe('q 1');
  });

  it('falls back to built-in Norwegian questions when the generator fails or rejects', async () => {
    let calls = 0;
    const game = createQuizGame(async () => {
      calls += 1;
      return [];
    }) as FullQuizGame;
    const { ctx, bindState, getState } = createTestCtx('quiz-fallback', [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);

    let state = bindState(game.onStart(ctx)!);
    await flush();
    state = getState();

    expect(state.phase).toBe('QUESTION');
    expect(state.aiFailed).toBe(true);
    const served = state.questions[0];
    const original = FALLBACK_QUESTIONS.find((f) => f.question === served.question);
    expect(original).toBeDefined();
    expect(served.options.length).toBe(4);
    expect(served.options[served.correctIndex]).toBe(original!.options[original!.correctIndex]);

    for (let round = 1; round <= 9; round++) {
      state = game.onHostAction(ctx, state, { type: 'next' })!;
      state = game.onHostAction(ctx, state, { type: 'next' })!;
    }
    expect(calls).toBe(1);

    const rejectGame = createQuizGame(async () => {
      throw new Error('boom');
    }) as FullQuizGame;
    const rejectCtx = createTestCtx('quiz-reject', [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);
    rejectCtx.bindState(rejectGame.onStart(rejectCtx.ctx)!);
    await flush();
    expect(rejectCtx.getState().phase).toBe('QUESTION');
    expect(rejectCtx.getState().aiFailed).toBe(true);
  });

  it('skips questions already used in the same room', async () => {
    const game = createQuizGame(async () => makeQuestions(10, 'q')) as FullQuizGame;
    const { ctx, bindState, getState } = createTestCtx('quiz-norepeat', [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);

    bindState(game.onStart(ctx)!);
    await flush();
    let state = getState();
    expect(state.questions[0].question).toBe('q 1');

    bindState(game.onStart(ctx)!);
    await flush();
    state = getState();
    expect(state.phase).toBe('QUESTION');
    expect(state.questions[0].question).not.toBe('q 1');
  });

  it('reveals when a connected player disconnects after everyone else answered, without eliminating them', async () => {
    const game = createQuizGame(async () => makeQuestions(10, 'q')) as FullQuizGame;
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Carol', connected: true },
    ];
    const { ctx, bindState, getState, score } = createTestCtx('quiz-disconnect', players);

    let state = bindState(game.onStart(ctx)!);
    await flush();
    state = getState();

    state = answer(game, ctx, state, 'p1', 0);
    state = answer(game, ctx, state, 'p2', 1);

    players[2].connected = false;
    state = game.onPlayerDisconnect(ctx, state, 'p3')!;

    expect(state.phase).toBe('REVEAL');
    expect(state.aliveIds).toEqual(['p1', 'p3']);
    expect(score('p1')).toBe(1);
    expect(state.results.some((r) => r.playerId === 'p3')).toBe(false);
  });

  it('ends the game cleanly on reveal when no alive players are connected', async () => {
    const game = createQuizGame(async () => makeQuestions(10, 'q')) as FullQuizGame;
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ];
    const { ctx, bindState, getState, isEnded } = createTestCtx('quiz-all-dc', players);

    let state = bindState(game.onStart(ctx)!);
    await flush();
    state = getState();

    players[0].connected = false;
    players[1].connected = false;
    game.onTimerExpired(ctx, state);
    expect(isEnded()).toBe(true);
  });

  it('ends the game with a winner bonus when players leave until one remains', async () => {
    const game = createQuizGame(async () => makeQuestions(10, 'q')) as FullQuizGame;
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Carol', connected: true },
    ];
    const { ctx, bindState, getState, isEnded, score } = createTestCtx('quiz-leave', players);

    let state = bindState(game.onStart(ctx)!);
    await flush();
    state = getState();

    state = answer(game, ctx, state, 'p1', 0);
    state = game.onPlayerLeave(ctx, state, 'p2')!;
    expect(state.phase).toBe('QUESTION');
    expect(state.aliveIds).toEqual(['p1', 'p3']);

    state = game.onPlayerLeave(ctx, state, 'p3')!;
    expect(isEnded()).toBe(true);
    expect(score('p1')).toBe(2);
  });
});
