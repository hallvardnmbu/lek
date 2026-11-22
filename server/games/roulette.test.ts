import { describe, expect, it } from 'bun:test';
import type { GameContext } from '../game';
import { computeStepDelayMs, rouletteGame } from './roulette';

interface TestPlayer {
  id: string;
  name: string;
  connected: boolean;
}

function createTestCtx(players: TestPlayer[]) {
  const timers: number[] = [];
  let cleared = 0;
  const events: Array<{ event: string; payload: unknown }> = [];

  const toGamePlayers = () =>
    players.map((p) => ({
      id: p.id,
      name: p.name,
      score: 0,
      connected: p.connected,
      meta: {},
    }));

  const ctx: GameContext = {
    roomCode: 'roulette-test',
    getPlayers: () => toGamePlayers(),
    getPlayer: (id) => toGamePlayers().find((p) => p.id === id),
    setPlayerScore: () => {},
    addPlayerScore: () => {},
    setPlayerMeta: () => {},
    setTimer: (ms) => timers.push(ms),
    clearTimer: () => {
      cleared++;
    },
    broadcastEvent: (event, payload) => events.push({ event, payload }),
    sendEventToHost: () => {},
    sendEventToPlayer: () => {},
    emitWebhook: () => {},
    endGame: () => {},
  };

  return { ctx, timers, events, getCleared: () => cleared };
}

const threePlayers: TestPlayer[] = [
  { id: 'p1', name: 'Alice', connected: true },
  { id: 'p2', name: 'Bob', connected: true },
  { id: 'p3', name: 'Carol', connected: true },
];

describe('Roulette game', () => {
  it('slows down step delays monotonically and totals ~40 seconds', () => {
    const totalSteps = 55;
    const first = computeStepDelayMs(0, totalSteps);
    const mid = computeStepDelayMs(27, totalSteps);
    const last = computeStepDelayMs(totalSteps - 1, totalSteps);

    expect(first).toBeLessThan(mid);
    expect(mid).toBeLessThan(last);

    let sum = 0;
    for (let i = 0; i < totalSteps; i++) {
      sum += computeStepDelayMs(i, totalSteps);
    }
    expect(sum).toBeGreaterThanOrEqual(39_900);
    expect(sum).toBeLessThanOrEqual(40_100);
  });

  it('cycles active player around the room until stopping on one selected player', () => {
    const { ctx, timers, events, getCleared } = createTestCtx(threePlayers);
    let state = rouletteGame.onStart(ctx);

    expect(state.phase).toBe('SPINNING');
    expect(timers.length).toBe(1);

    const seenActive = new Set<string>();
    while (state.phase === 'SPINNING') {
      const activeViews = threePlayers.filter(
        (p) => rouletteGame.getPlayerView(state, p.id, ctx).isActive
      );
      expect(activeViews.length).toBe(1);
      seenActive.add(activeViews[0].id);
      state = rouletteGame.onTimerExpired!(ctx, state)!;
    }

    expect(state.phase).toBe('STOPPED');
    expect(state.selectedId).not.toBeNull();
    expect(seenActive.size).toBe(3);
    expect(getCleared()).toBe(1);
    expect(events.some((e) => e.event === 'roulette_stopped')).toBe(true);

    const selectedViews = threePlayers.filter(
      (p) => rouletteGame.getPlayerView(state, p.id, ctx).isSelected
    );
    expect(selectedViews.length).toBe(1);
    expect(selectedViews[0].id).toBe(state.selectedId!);

    const hostView = rouletteGame.getHostView(state, ctx);
    expect(hostView.phase).toBe('STOPPED');
    expect(hostView.selectedName).toBe(selectedViews[0].name);
  });

  it('allows spinning again once stopped via host or player action', () => {
    const { ctx } = createTestCtx(threePlayers);
    let state = rouletteGame.onStart(ctx);

    while (state.phase === 'SPINNING') {
      state = rouletteGame.onTimerExpired!(ctx, state)!;
    }
    expect(state.phase).toBe('STOPPED');

    state = rouletteGame.onHostAction!(ctx, state, { type: 'spin' })!;
    expect(state.phase).toBe('SPINNING');

    while (state.phase === 'SPINNING') {
      state = rouletteGame.onTimerExpired!(ctx, state)!;
    }
    expect(state.phase).toBe('STOPPED');

    state = rouletteGame.onPlayerAction(ctx, state, 'p1', { type: 'spin' })!;
    expect(state.phase).toBe('SPINNING');
  });
});
