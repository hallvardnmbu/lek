import type { GameContext, GameDefinition } from '../game';
import { awardCappedScore, connectedOrAllPlayers, shuffle } from './helpers';
import {
  END_DELAY_MS,
  TANK_COLORS,
  TANK_SPAWNS,
  TANK_WALLS,
  TANK_WORLD_HEIGHT,
  TANK_WORLD_WIDTH,
  type TankGameBullet,
  type TankGameElimination,
  type TankGameHostView,
  type TankGamePhase,
  type TankGamePlayerView,
  type TankGameTank,
  type TankInput,
  type TankWall,
} from '../../shared/games/tankgame';

export { END_DELAY_MS };

export interface TankGameState {
  phase: TankGamePhase;
  countdownEndsAt: number;
  playingStartedAt: number;
  endedAt: number;
  winnerId: string | null;
  tickAt: number;
  nextBulletId: number;
  tanks: Record<string, TankGameTank>;
  bullets: TankGameBullet[];
  inputs: Record<string, TankInput>;
  eliminations: TankGameElimination[];
}

const TICK_MS = 50;
const COUNTDOWN_MS = 3000;
const GAME_TIMEOUT_MS = 120_000;
const MAX_DT_MS = 150;
const TANK_SPEED = 110;
const TANK_RADIUS = 16;
const BULLET_SPEED = 420;
const BULLET_RADIUS = 5;
const BULLET_LIFETIME_MS = 1600;
const FIRE_COOLDOWN_MS = 900;
const INPUT_DEADZONE = 0.18;
const KILL_POINTS = 1;
const WIN_POINTS = 2;
const ELIMINATION_FEED_MS = 3500;
const BULLET_SUBSTEP_PX = 12;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function resolveCircleWall(
  cx: number,
  cy: number,
  r: number,
  wall: TankWall
): { x: number; y: number } | null {
  const closestX = Math.max(wall.x, Math.min(cx, wall.x + wall.w));
  const closestY = Math.max(wall.y, Math.min(cy, wall.y + wall.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= r * r) return null;
  if (distSq > 0) {
    const dist = Math.sqrt(distSq);
    return { x: (dx / dist) * (r - dist), y: (dy / dist) * (r - dist) };
  }
  const left = cx - wall.x;
  const right = wall.x + wall.w - cx;
  const top = cy - wall.y;
  const bottom = wall.y + wall.h - cy;
  const min = Math.min(left, right, top, bottom);
  if (min === left) return { x: -(left + r), y: 0 };
  if (min === right) return { x: right + r, y: 0 };
  if (min === top) return { x: 0, y: -(top + r) };
  return { x: 0, y: bottom + r };
}

function moveTank(tank: TankGameTank, input: TankInput, dtSec: number): void {
  const mag = Math.hypot(input.x, input.y);
  if (mag < INPUT_DEADZONE) return;
  const nx = input.x / mag;
  const ny = input.y / mag;
  const scale = Math.min(1, mag);
  tank.angle = Math.atan2(ny, nx);
  tank.x += nx * TANK_SPEED * scale * dtSec;
  tank.y += ny * TANK_SPEED * scale * dtSec;
  for (let pass = 0; pass < 2; pass++) {
    for (const wall of TANK_WALLS) {
      const push = resolveCircleWall(tank.x, tank.y, TANK_RADIUS, wall);
      if (push) {
        tank.x += push.x;
        tank.y += push.y;
      }
    }
  }
  tank.x = Math.max(TANK_RADIUS, Math.min(TANK_WORLD_WIDTH - TANK_RADIUS, tank.x));
  tank.y = Math.max(TANK_RADIUS, Math.min(TANK_WORLD_HEIGHT - TANK_RADIUS, tank.y));
}

function tankVelocity(state: TankGameState, tank: TankGameTank): { vx: number; vy: number } {
  if (!tank.alive || state.phase !== 'PLAYING') return { vx: 0, vy: 0 };
  const input = state.inputs[tank.playerId];
  if (!input) return { vx: 0, vy: 0 };
  const mag = Math.hypot(input.x, input.y);
  if (mag < INPUT_DEADZONE) return { vx: 0, vy: 0 };
  const factor = (Math.min(1, mag) / mag) * TANK_SPEED;
  return {
    vx: round1(input.x * factor),
    vy: round1(input.y * factor),
  };
}

function separateTanks(alive: TankGameTank[]): void {
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minDist = TANK_RADIUS * 2;
      if (dist === 0) {
        a.x -= 1;
        b.x += 1;
        continue;
      }
      if (dist >= minDist) continue;
      const push = (minDist - dist) / 2;
      const nx = dx / dist;
      const ny = dy / dist;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
    }
  }
}

function bulletBlocked(x: number, y: number): boolean {
  if (x < 0 || x > TANK_WORLD_WIDTH || y < 0 || y > TANK_WORLD_HEIGHT) return true;
  return TANK_WALLS.some((wall) => resolveCircleWall(x, y, BULLET_RADIUS, wall) !== null);
}

function findBulletHit(state: TankGameState, bullet: TankGameBullet): TankGameTank | null {
  for (const tank of Object.values(state.tanks)) {
    if (!tank.alive || tank.playerId === bullet.ownerId) continue;
    const dx = bullet.x - tank.x;
    const dy = bullet.y - tank.y;
    if (dx * dx + dy * dy < (TANK_RADIUS + BULLET_RADIUS) * (TANK_RADIUS + BULLET_RADIUS)) {
      return tank;
    }
  }
  return null;
}

function eliminateTank(
  ctx: GameContext,
  state: TankGameState,
  tank: TankGameTank,
  byPlayerId: string | null,
  now: number
): void {
  tank.alive = false;
  delete state.inputs[tank.playerId];
  state.eliminations.push({ playerId: tank.playerId, byPlayerId, at: now });
  if (state.eliminations.length > 10) state.eliminations = state.eliminations.slice(-10);
  if (byPlayerId) awardCappedScore(ctx, byPlayerId, KILL_POINTS);
}

function advanceBullets(ctx: GameContext, state: TankGameState, dtSec: number, now: number): void {
  const keep: TankGameBullet[] = [];
  outer: for (const bullet of state.bullets) {
    const totalDist = BULLET_SPEED * dtSec;
    const steps = Math.max(1, Math.ceil(totalDist / BULLET_SUBSTEP_PX));
    const stepDist = totalDist / steps;
    for (let s = 0; s < steps; s++) {
      bullet.x += Math.cos(bullet.angle) * stepDist;
      bullet.y += Math.sin(bullet.angle) * stepDist;
      if (bulletBlocked(bullet.x, bullet.y)) continue outer;
      const victim = findBulletHit(state, bullet);
      if (victim) {
        eliminateTank(ctx, state, victim, bullet.ownerId, now);
        continue outer;
      }
    }
    if (now - bullet.firedAt <= BULLET_LIFETIME_MS) keep.push(bullet);
  }
  state.bullets = keep;
}

function simulate(ctx: GameContext, state: TankGameState, now: number): void {
  const dt = Math.min(now - state.tickAt, MAX_DT_MS);
  if (dt <= 0) return;
  const dtSec = dt / 1000;
  const alive = aliveTanks(state);
  for (const tank of alive) {
    const input = state.inputs[tank.playerId];
    if (input) moveTank(tank, input, dtSec);
  }
  separateTanks(alive);
  advanceBullets(ctx, state, dtSec, now);
  state.tickAt = now;
}

function aliveTanks(state: TankGameState): TankGameTank[] {
  return Object.values(state.tanks).filter((t) => t.alive);
}

function enterEnding(
  ctx: GameContext,
  state: TankGameState,
  winnerId: string | null,
  now: number
): true {
  if (winnerId) awardCappedScore(ctx, winnerId, WIN_POINTS);
  state.phase = 'ENDING';
  state.winnerId = winnerId;
  state.endedAt = now;
  state.inputs = {};
  state.bullets = [];
  ctx.setTimer(END_DELAY_MS, false);
  return true;
}

function checkGameEnd(ctx: GameContext, state: TankGameState, now: number): boolean {
  if (state.phase !== 'PLAYING') return false;
  const alive = aliveTanks(state);
  if (alive.length <= 1) {
    return enterEnding(ctx, state, alive.length === 1 ? alive[0].playerId : null, now);
  }
  if (now - state.playingStartedAt >= GAME_TIMEOUT_MS) {
    return enterEnding(ctx, state, null, now);
  }
  return false;
}

function timeLeftMs(state: TankGameState, now: number): number {
  if (state.phase === 'COUNTDOWN') return Math.max(0, state.countdownEndsAt - now);
  const refNow = state.phase === 'ENDING' ? state.endedAt : now;
  return Math.max(0, GAME_TIMEOUT_MS - (refNow - state.playingStartedAt));
}

function nextDelayMs(state: TankGameState, now: number): number {
  const left = timeLeftMs(state, now);
  if (Object.keys(state.inputs).length > 0 || state.bullets.length > 0) {
    return Math.min(TICK_MS, left);
  }
  let next = left;
  for (const tank of Object.values(state.tanks)) {
    if (!tank.alive || tank.lastFiredAt <= 0) continue;
    const cdLeft = tank.lastFiredAt + FIRE_COOLDOWN_MS - now;
    if (cdLeft > 0) next = Math.min(next, cdLeft);
  }
  for (const e of state.eliminations) {
    const feedLeft = e.at + ELIMINATION_FEED_MS - now;
    if (feedLeft > 0) next = Math.min(next, feedLeft);
  }
  return Math.max(1, next);
}

function destroyTank(ctx: GameContext, state: TankGameState, playerId: string, now: number): void {
  const tank = state.tanks[playerId];
  delete state.inputs[playerId];
  if (!tank?.alive) return;
  eliminateTank(ctx, state, tank, null, now);
}

export const tankGame: GameDefinition<TankGameState, TankGameHostView, TankGamePlayerView> = {
  id: 'tank-battle',
  name: 'Tanks',
  description: 'Drive, hide behind cover, and be the last tank rolling.',
  minPlayers: 2,
  maxPlayers: TANK_SPAWNS.length,

  onStart(ctx) {
    const roster = connectedOrAllPlayers(ctx);
    const spawns = shuffle(TANK_SPAWNS);
    const now = Date.now();
    const state: TankGameState = {
      phase: 'COUNTDOWN',
      countdownEndsAt: now + COUNTDOWN_MS,
      playingStartedAt: 0,
      endedAt: 0,
      winnerId: null,
      tickAt: now,
      nextBulletId: 1,
      tanks: {},
      bullets: [],
      inputs: {},
      eliminations: [],
    };
    roster.slice(0, TANK_SPAWNS.length).forEach((player, i) => {
      const spawn = spawns[i];
      state.tanks[player.id] = {
        playerId: player.id,
        x: spawn.x,
        y: spawn.y,
        angle: Math.atan2(TANK_WORLD_HEIGHT / 2 - spawn.y, TANK_WORLD_WIDTH / 2 - spawn.x),
        alive: true,
        colorIndex: i % TANK_COLORS.length,
        lastFiredAt: 0,
      };
    });
    ctx.setTimer(COUNTDOWN_MS);
    return state;
  },

  onTimerExpired(ctx, state) {
    const now = Date.now();
    if (state.phase === 'COUNTDOWN') {
      state.phase = 'PLAYING';
      state.playingStartedAt = now;
      state.tickAt = now;
      if (!checkGameEnd(ctx, state, now)) {
        ctx.setTimer(GAME_TIMEOUT_MS, true);
      }
      return state;
    }
    if (state.phase === 'ENDING') {
      ctx.endGame();
      return state;
    }
    if (state.phase !== 'PLAYING') return state;
    simulate(ctx, state, now);
    if (!checkGameEnd(ctx, state, now)) ctx.setTimer(nextDelayMs(state, now), false);
    return state;
  },

  onPlayerAction(ctx, state, playerId, action) {
    if (state.phase !== 'PLAYING' || !state.tanks[playerId]?.alive) return state;
    const wasSimulating = Object.keys(state.inputs).length > 0 || state.bullets.length > 0;

    if (action.type === 'input') {
      const raw = action.payload as { x?: unknown; y?: unknown } | undefined;
      const x = Number(raw?.x);
      const y = Number(raw?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return state;
      const now = Date.now();
      if (now > state.tickAt) {
        simulate(ctx, state, now);
        if (checkGameEnd(ctx, state, now)) return state;
      }
      const tank = state.tanks[playerId];
      if (!tank?.alive) return state;
      const mag = Math.hypot(x, y);
      if (mag < INPUT_DEADZONE) {
        delete state.inputs[playerId];
      } else {
        state.inputs[playerId] = mag <= 1 ? { x, y } : { x: x / mag, y: y / mag };
      }
      const isSimulating = Object.keys(state.inputs).length > 0 || state.bullets.length > 0;
      if (!wasSimulating && isSimulating) {
        state.tickAt = now;
        ctx.setTimer(nextDelayMs(state, now), false);
      }
      return state;
    }

    if (action.type === 'fire') {
      const now = Date.now();
      if (now > state.tickAt) {
        simulate(ctx, state, now);
        if (checkGameEnd(ctx, state, now)) return state;
      }
      const tank = state.tanks[playerId];
      if (!tank?.alive || now - tank.lastFiredAt < FIRE_COOLDOWN_MS) return state;
      tank.lastFiredAt = now;
      state.bullets.push({
        id: state.nextBulletId++,
        ownerId: playerId,
        x: tank.x + Math.cos(tank.angle) * (TANK_RADIUS + BULLET_RADIUS + 2),
        y: tank.y + Math.sin(tank.angle) * (TANK_RADIUS + BULLET_RADIUS + 2),
        angle: tank.angle,
        firedAt: now,
      });
      const isSimulating = Object.keys(state.inputs).length > 0 || state.bullets.length > 0;
      if (!wasSimulating && isSimulating) {
        state.tickAt = now;
        ctx.setTimer(nextDelayMs(state, now), false);
      }
      return state;
    }

    return state;
  },

  onPlayerDisconnect(ctx, state, playerId) {
    if (state.phase === 'ENDING') return state;
    const now = Date.now();
    destroyTank(ctx, state, playerId, now);
    checkGameEnd(ctx, state, now);
    return state;
  },

  onPlayerLeave(ctx, state, playerId) {
    const now = Date.now();
    if (state.phase !== 'ENDING') {
      destroyTank(ctx, state, playerId, now);
    }
    delete state.tanks[playerId];
    checkGameEnd(ctx, state, now);
    return state;
  },

  getHostView(state) {
    const now = Date.now();
    return {
      phase: state.phase,
      timeLeftMs: timeLeftMs(state, now),
      aliveCount: aliveTanks(state).length,
      winnerId: state.winnerId,
      tanks: Object.values(state.tanks).map((t) => {
        const vel = tankVelocity(state, t);
        return {
          playerId: t.playerId,
          x: round1(t.x),
          y: round1(t.y),
          vx: vel.vx,
          vy: vel.vy,
          angle: t.angle,
          colorIndex: t.colorIndex,
          alive: t.alive,
        };
      }),
      bullets: state.bullets.map((b) => ({
        id: b.id,
        x: round1(b.x),
        y: round1(b.y),
        vx: round1(Math.cos(b.angle) * BULLET_SPEED),
        vy: round1(Math.sin(b.angle) * BULLET_SPEED),
      })),
      eliminations: state.eliminations.filter((e) => now - e.at <= ELIMINATION_FEED_MS),
    };
  },

  getPlayerView(state, playerId) {
    const now = Date.now();
    const tank = state.tanks[playerId];
    return {
      phase: state.phase,
      participating: Boolean(tank),
      alive: tank?.alive ?? false,
      colorIndex: tank?.colorIndex ?? null,
      timeLeftMs: timeLeftMs(state, now),
      cooldownMs:
        tank?.alive && state.phase === 'PLAYING'
          ? Math.max(0, FIRE_COOLDOWN_MS - (now - tank.lastFiredAt))
          : 0,
    };
  },
};
