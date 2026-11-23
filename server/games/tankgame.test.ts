import { describe, expect, it } from 'bun:test';
import type { GameContext, GameDefinition } from '../game';
import type {
  TankGameHostView,
  TankGamePlayerView,
  TankGameState,
} from '../../shared/games/tankgame';
import { tankGame } from './tankgame';

type FullTankGame = Required<
  GameDefinition<TankGameState, TankGameHostView, TankGamePlayerView>
>;

const game = tankGame as FullTankGame;

interface TestPlayer {
  id: string;
  name: string;
  connected: boolean;
}

function createTestCtx(players: TestPlayer[]) {
  const scores = new Map<string, number>();
  const timers: number[] = [];
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
    roomCode: 'TEST',
    getPlayers: () => toGamePlayers(),
    getPlayer: (id) => toGamePlayers().find((p) => p.id === id),
    setPlayerScore: (id, score) => scores.set(id, score),
    addPlayerScore: (id, delta) => scores.set(id, (scores.get(id) ?? 0) + delta),
    setPlayerMeta: () => {},
    setTimer: (ms) => {
      timers.push(ms);
    },
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
    scoreOf: (id: string) => scores.get(id) ?? 0,
    isEnded: () => ended,
    lastTimer: () => timers[timers.length - 1],
  };
}

function startPlaying(players: TestPlayer[]) {
  const test = createTestCtx(players);
  let state = game.onStart(test.ctx);
  state = game.onTimerExpired(test.ctx, state)!;
  return { ...test, state };
}

function tick(ctx: GameContext, state: TankGameState, dtMs = 50): void {
  state.tickAt = Date.now() - dtMs;
  game.onTimerExpired(ctx, state);
}

function fireAction(ctx: GameContext, state: TankGameState, playerId: string): void {
  game.onPlayerAction(ctx, state, playerId, { type: 'fire' });
}

describe('tank battle', () => {
  it('sets up countdown with connected players on distinct spawns', () => {
    const test = createTestCtx([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Cara', connected: false },
    ]);
    const state = game.onStart(test.ctx);
    expect(state.phase).toBe('COUNTDOWN');
    expect(Object.keys(state.tanks).sort()).toEqual(['p1', 'p2']);
    const tanks = Object.values(state.tanks);
    const spots = new Set(tanks.map((t) => `${t.x},${t.y}`));
    expect(spots.size).toBe(2);
    const colors = new Set(tanks.map((t) => t.colorIndex));
    expect(colors.size).toBe(2);
    expect(tanks.every((t) => t.alive)).toBe(true);
    const host = game.getHostView(state, test.ctx);
    expect(host.phase).toBe('COUNTDOWN');
    expect(host.timeLeftMs).toBeGreaterThan(2900);
    expect(host.aliveCount).toBe(2);
  });

  it('transitions countdown to playing on timer expiry', () => {
    const test = createTestCtx([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);
    const state = game.onStart(test.ctx);
    const next = game.onTimerExpired(test.ctx, state)!;
    expect(next.phase).toBe('PLAYING');
    expect(test.isEnded()).toBe(false);
  });

  it('moves tanks on input and stops them against walls', () => {
    const test = startPlaying([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);
    const tank = test.state.tanks.p1;
    tank.x = 200;
    tank.y = 100;
    tank.angle = 0;
    game.onPlayerAction(test.ctx, test.state, 'p1', {
      type: 'input',
      payload: { x: 0, y: 1 },
    });
    for (let i = 0; i < 10; i++) tick(test.ctx, test.state);
    expect(tank.y).toBeGreaterThan(120);
    expect(tank.y).toBeLessThanOrEqual(124.001);
    expect(tank.x).toBeCloseTo(200, 0);
    expect(tank.angle).toBeCloseTo(Math.PI / 2, 5);
  });

  it('normalizes joystick input magnitude and rejects invalid input', () => {
    const test = startPlaying([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);
    game.onPlayerAction(test.ctx, test.state, 'p1', {
      type: 'input',
      payload: { x: 3, y: 4 },
    });
    expect(test.state.inputs.p1).toEqual({ x: 0.6, y: 0.8 });
    delete test.state.inputs.p1;
    game.onPlayerAction(test.ctx, test.state, 'p1', {
      type: 'input',
      payload: { x: 'bad', y: 4 },
    });
    expect(test.state.inputs.p1).toBeUndefined();
  });

  it('fires bullets with a cooldown', () => {
    const test = startPlaying([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);
    const tank = test.state.tanks.p1;
    tank.x = 200;
    tank.y = 200;
    tank.angle = 0;
    fireAction(test.ctx, test.state, 'p1');
    expect(test.state.bullets.length).toBe(1);
    expect(test.state.bullets[0].ownerId).toBe('p1');
    expect(test.state.bullets[0].x).toBeCloseTo(223, 0);
    expect(test.state.bullets[0].y).toBeCloseTo(200, 0);
    fireAction(test.ctx, test.state, 'p1');
    expect(test.state.bullets.length).toBe(1);
    tank.lastFiredAt -= 1000;
    fireAction(test.ctx, test.state, 'p1');
    expect(test.state.bullets.length).toBe(2);
  });

  it('removes bullets that hit walls', () => {
    const test = startPlaying([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);
    test.state.bullets.push({
      id: 1,
      ownerId: 'p2',
      x: 100,
      y: 160,
      angle: 0,
      firedAt: Date.now(),
    });
    tick(test.ctx, test.state);
    expect(test.state.bullets.length).toBe(1);
    tick(test.ctx, test.state);
    expect(test.state.bullets.length).toBe(0);
  });

  it('eliminates a hit tank and awards kill points', () => {
    const test = startPlaying([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Cara', connected: true },
    ]);
    const shooter = test.state.tanks.p1;
    shooter.x = 100;
    shooter.y = 100;
    shooter.angle = 0;
    test.state.tanks.p2.x = 160;
    test.state.tanks.p2.y = 100;
    fireAction(test.ctx, test.state, 'p1');
    tick(test.ctx, test.state);
    expect(test.state.tanks.p2.alive).toBe(false);
    expect(test.scoreOf('p1')).toBe(500);
    expect(test.state.eliminations).toEqual([
      { playerId: 'p2', byPlayerId: 'p1', at: expect.any(Number) },
    ]);
    expect(test.state.bullets.length).toBe(0);
    expect(test.isEnded()).toBe(false);
  });

  it('awards win points and ends the game when one tank remains', () => {
    const test = startPlaying([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);
    const shooter = test.state.tanks.p1;
    shooter.x = 100;
    shooter.y = 100;
    shooter.angle = 0;
    test.state.tanks.p2.x = 160;
    test.state.tanks.p2.y = 100;
    fireAction(test.ctx, test.state, 'p1');
    tick(test.ctx, test.state);
    expect(test.state.tanks.p2.alive).toBe(false);
    expect(test.scoreOf('p1')).toBe(1000);
    expect(test.isEnded()).toBe(true);
  });

  it('destroys tanks on disconnect and ends a two-player game', () => {
    const test = startPlaying([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);
    const next = game.onPlayerDisconnect(test.ctx, test.state, 'p2')!;
    expect(next.tanks.p2.alive).toBe(false);
    expect(next.eliminations[0].byPlayerId).toBeNull();
    expect(test.scoreOf('p1')).toBe(500);
    expect(test.isEnded()).toBe(true);
  });

  it('ends the game on timeout without awarding win points', () => {
    const test = startPlaying([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);
    test.state.playingStartedAt = Date.now() - 121_000;
    tick(test.ctx, test.state);
    expect(test.isEnded()).toBe(true);
    expect(test.scoreOf('p1')).toBe(0);
    expect(test.scoreOf('p2')).toBe(0);
  });

  it('treats unknown players as spectators in player views', () => {
    const test = startPlaying([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);
    const view = game.getPlayerView(test.state, 'pX', test.ctx);
    expect(view.participating).toBe(false);
    expect(view.alive).toBe(false);
    expect(view.colorIndex).toBeNull();
    const own = game.getPlayerView(test.state, 'p1', test.ctx);
    expect(own.participating).toBe(true);
    expect(own.alive).toBe(true);
    expect(own.cooldownMs).toBe(0);
  });

  it('sleeps when idle and only ticks at 50ms while tanks or bullets are active', () => {
    const test = startPlaying([
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ]);
    expect(test.lastTimer()).toBeGreaterThan(100_000);

    game.onPlayerAction(test.ctx, test.state, 'p1', {
      type: 'input',
      payload: { x: 1, y: 0 },
    });
    expect(test.lastTimer()).toBe(50);

    game.onPlayerAction(test.ctx, test.state, 'p1', {
      type: 'input',
      payload: { x: 0, y: 0 },
    });
    tick(test.ctx, test.state);
    expect(test.lastTimer()).toBeGreaterThan(100_000);
  });
});
