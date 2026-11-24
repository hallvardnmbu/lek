import { describe, expect, it } from 'bun:test';
import {
  SPIN_LEAD_MS,
  STOPPED_HOLD_MS,
  buildStepOffsetsMs,
  computeStepDelayMs,
  totalSpinDurationMs,
} from '../../shared/games/roulette';
import type { GameContext } from '../game';
import { rouletteGame } from './roulette';

interface TestPlayer {
  id: string;
  name: string;
  connected: boolean;
}

function createTestCtx(players: TestPlayer[]) {
  const timers: Array<{ ms: number; showCountdown?: boolean }> = [];
  let cleared = 0;
  let ended = false;
  const events: Array<{ event: string; payload: unknown }> = [];
  const scores = new Map<string, number>();

  const toGamePlayers = () =>
    players.map((p) => ({
      id: p.id,
      name: p.name,
      score: scores.get(p.id) ?? 0,
      totalScore: scores.get(p.id) ?? 0,
      connected: p.connected,
      meta: {},
    }));

  const ctx: GameContext = {
    roomCode: 'roulette-test',
    getPlayers: () => toGamePlayers(),
    getPlayer: (id) => toGamePlayers().find((p) => p.id === id),
    setPlayerScore: (id, score) => scores.set(id, score),
    addPlayerScore: (id, delta) => scores.set(id, (scores.get(id) ?? 0) + delta),
    setPlayerMeta: () => {},
    setTimer: (ms, showCountdown) => {
      timers.push({ ms, showCountdown });
    },
    clearTimer: () => {
      cleared++;
    },
    dispatch: () => {},
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
    timers,
    events,
    getCleared: () => cleared,
    isEnded: () => ended,
    score: (id: string) => scores.get(id) ?? 0,
  };
}

const threePlayers: TestPlayer[] = [
  { id: 'p1', name: 'Alice', connected: true },
  { id: 'p2', name: 'Bob', connected: true },
  { id: 'p3', name: 'Carol', connected: true },
];

describe('Roulette game', () => {
  it('slows down step delays monotonically and totals ~20 seconds', () => {
    const totalSteps = 55;
    const first = computeStepDelayMs(0, totalSteps);
    const mid = computeStepDelayMs(27, totalSteps);
    const last = computeStepDelayMs(totalSteps - 1, totalSteps);

    expect(first).toBeLessThan(mid);
    expect(mid).toBeLessThan(last);

    const sum = totalSpinDurationMs(totalSteps);
    expect(sum).toBeGreaterThanOrEqual(19_900);
    expect(sum).toBeLessThanOrEqual(20_100);

    const offsets = buildStepOffsetsMs(totalSteps);
    expect(offsets.length).toBe(totalSteps);
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBe(first);
  });

  it('spins once, holds on STOPPED for STOPPED_HOLD_MS, then ends the game automatically', () => {
    const { ctx, timers, events, getCleared, isEnded, score } = createTestCtx(threePlayers);
    let state = rouletteGame.onStart(ctx);

    expect(state.phase).toBe('SPINNING');
    expect(timers.length).toBe(1);
    expect(timers[0].ms).toBe(SPIN_LEAD_MS + totalSpinDurationMs(state.totalSteps));

    const hostSpinView = rouletteGame.getHostView(state, ctx);
    expect(hostSpinView.spin).not.toBeNull();
    expect(hostSpinView.spin?.playerOrder).toEqual(['p1', 'p2', 'p3']);

    const playerSpinView = rouletteGame.getPlayerView(state, 'p1', ctx);
    expect(playerSpinView.spin?.spinStartAt).toBe(hostSpinView.spin?.spinStartAt);
    expect(playerSpinView.spin?.startIndex).toBe(hostSpinView.spin?.startIndex);
    expect(playerSpinView.spin?.totalSteps).toBe(hostSpinView.spin?.totalSteps);

    const expectedSelectedId =
      state.playerOrder[(state.startIndex + state.totalSteps - 1) % state.playerOrder.length];

    state = rouletteGame.onTimerExpired!(ctx, state)!;

    expect(state.phase).toBe('STOPPED');
    expect(state.selectedId).toBe(expectedSelectedId);
    expect(isEnded()).toBe(false);
    expect(timers.length).toBe(2);
    expect(timers[1]).toEqual({ ms: STOPPED_HOLD_MS, showCountdown: false });
    expect(events.some((e) => e.event === 'roulette_stopped')).toBe(true);

    const selectedViews = threePlayers.filter(
      (p) => rouletteGame.getPlayerView(state, p.id, ctx).isSelected
    );
    expect(selectedViews.length).toBe(1);
    expect(selectedViews[0].id).toBe(expectedSelectedId);

    const hostView = rouletteGame.getHostView(state, ctx);
    expect(hostView.phase).toBe('STOPPED');
    expect(hostView.spin).toBeNull();
    expect(hostView.selectedName).toBe(selectedViews[0].name);

    for (const p of threePlayers) {
      expect(score(p.id)).toBe(p.id === expectedSelectedId ? 0 : 1);
    }

    state = rouletteGame.onTimerExpired!(ctx, state)!;
    expect(getCleared()).toBe(1);
    expect(isEnded()).toBe(true);
  });

  it('ignores spin actions after stopping since roulette is single-spin', () => {
    const { ctx } = createTestCtx(threePlayers);
    let state = rouletteGame.onStart(ctx);

    state = rouletteGame.onTimerExpired!(ctx, state)!;
    expect(state.phase).toBe('STOPPED');
    expect(rouletteGame.onHostAction).toBeUndefined();

    state = rouletteGame.onPlayerAction(ctx, state, 'p1', { type: 'spin' })!;
    expect(state.phase).toBe('STOPPED');
  });

  it('cleans up playerOrder and selectedId on leave and ends when empty', () => {
    const { ctx, isEnded } = createTestCtx(threePlayers);

    let state = rouletteGame.onStart(ctx);
    state = rouletteGame.onTimerExpired!(ctx, state)!;
    const selected = state.selectedId!;

    state = rouletteGame.onPlayerLeave!(ctx, state, selected)!;
    expect(state.playerOrder).not.toContain(selected);
    expect(state.selectedId).toBeNull();
    expect(isEnded()).toBe(false);

    for (const remaining of state.playerOrder) {
      state = rouletteGame.onPlayerLeave!(ctx, state, remaining)!;
    }
    expect(state.playerOrder).toEqual([]);
    expect(isEnded()).toBe(true);
  });
});
