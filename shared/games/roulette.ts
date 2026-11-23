export type RoulettePhase = 'SPINNING' | 'STOPPED';

export const TOTAL_SPIN_MS = 20_000;
export const SPIN_LEAD_MS = 350;
const WEIGHT_GROWTH = 18;
const WEIGHT_POWER = 2.5;

function stepWeight(step: number, totalSteps: number): number {
  if (totalSteps <= 1) return 1;
  const progress = Math.min(1, Math.max(0, step / (totalSteps - 1)));
  return 1 + WEIGHT_GROWTH * Math.pow(progress, WEIGHT_POWER);
}

export function computeStepDelayMs(step: number, totalSteps: number): number {
  if (totalSteps <= 0) return TOTAL_SPIN_MS;
  let totalWeight = 0;
  for (let i = 0; i < totalSteps; i++) {
    totalWeight += stepWeight(i, totalSteps);
  }
  return Math.max(50, Math.round((TOTAL_SPIN_MS * stepWeight(step, totalSteps)) / totalWeight));
}

export function buildStepOffsetsMs(totalSteps: number): number[] {
  const offsets: number[] = [];
  let elapsed = 0;
  for (let i = 0; i < totalSteps; i++) {
    offsets.push(elapsed);
    elapsed += computeStepDelayMs(i, totalSteps);
  }
  return offsets;
}

export function totalSpinDurationMs(totalSteps: number): number {
  let total = 0;
  for (let i = 0; i < totalSteps; i++) {
    total += computeStepDelayMs(i, totalSteps);
  }
  return total;
}

export interface RoulettePlayerEntry {
  id: string;
  name: string;
  isSelected: boolean;
}

export interface RouletteSpinSchedule {
  spinStartAt: number;
  serverNow: number;
  startIndex: number;
  totalSteps: number;
  playerOrder: string[];
}

export interface RouletteState {
  phase: RoulettePhase;
  playerOrder: string[];
  startIndex: number;
  totalSteps: number;
  spinStartAt: number;
  selectedId: string | null;
}

export interface RouletteHostView {
  phase: RoulettePhase;
  players: RoulettePlayerEntry[];
  selectedName: string | null;
  spin: RouletteSpinSchedule | null;
}

export interface RoulettePlayerView {
  phase: RoulettePhase;
  playerId: string;
  isSelected: boolean;
  selectedName: string | null;
  spin: RouletteSpinSchedule | null;
}
