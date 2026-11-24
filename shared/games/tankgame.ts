export const TANK_WORLD_WIDTH = 1280;
export const TANK_WORLD_HEIGHT = 720;

export interface TankWall {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const TANK_WALLS: TankWall[] = [
  { x: 604, y: 304, w: 72, h: 112 },
  { x: 454, y: 336, w: 110, h: 48 },
  { x: 716, y: 336, w: 110, h: 48 },
  { x: 140, y: 140, w: 200, h: 40 },
  { x: 140, y: 180, w: 40, h: 120 },
  { x: 940, y: 140, w: 200, h: 40 },
  { x: 1100, y: 180, w: 40, h: 120 },
  { x: 140, y: 540, w: 200, h: 40 },
  { x: 140, y: 420, w: 40, h: 120 },
  { x: 940, y: 540, w: 200, h: 40 },
  { x: 1100, y: 420, w: 40, h: 120 },
  { x: 330, y: 0, w: 40, h: 190 },
  { x: 910, y: 0, w: 40, h: 190 },
  { x: 330, y: 530, w: 40, h: 190 },
  { x: 910, y: 530, w: 40, h: 190 },
  { x: 470, y: 130, w: 44, h: 130 },
  { x: 766, y: 130, w: 44, h: 130 },
  { x: 470, y: 460, w: 44, h: 130 },
  { x: 766, y: 460, w: 44, h: 130 },
  { x: 230, y: 344, w: 140, h: 32 },
  { x: 910, y: 344, w: 140, h: 32 },
];

export const TANK_SPAWNS: readonly { x: number; y: number }[] = [
  { x: 70, y: 70 },
  { x: 1210, y: 70 },
  { x: 70, y: 650 },
  { x: 1210, y: 650 },
  { x: 640, y: 55 },
  { x: 640, y: 665 },
  { x: 70, y: 360 },
  { x: 1210, y: 360 },
];

export const TANK_COLORS = [
  '#ff5252',
  '#ffab00',
  '#ffee58',
  '#69f0ae',
  '#40c4ff',
  '#b388ff',
  '#ff80ab',
  '#f5f5f5',
];

export type TankGamePhase = 'COUNTDOWN' | 'PLAYING' | 'ENDING';

export const END_DELAY_MS = 2_000;

export interface TankInput {
  x: number;
  y: number;
}

export interface TankGameTank {
  playerId: string;
  x: number;
  y: number;
  angle: number;
  alive: boolean;
  colorIndex: number;
  lastFiredAt: number;
}

export interface TankGameBullet {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  angle: number;
  firedAt: number;
}

export interface TankGameElimination {
  playerId: string;
  byPlayerId: string | null;
  at: number;
}

export interface TankGameHostView {
  phase: TankGamePhase;
  timeLeftMs: number;
  aliveCount: number;
  winnerId: string | null;
  tanks: Array<{
    playerId: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    colorIndex: number;
    alive: boolean;
  }>;
  bullets: Array<{ id: number; x: number; y: number; vx: number; vy: number }>;
  eliminations: TankGameElimination[];
}

export interface TankGamePlayerView {
  phase: TankGamePhase;
  participating: boolean;
  alive: boolean;
  colorIndex: number | null;
  timeLeftMs: number;
  cooldownMs: number;
}
