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

function totalStepWeight(totalSteps: number): number {
  let totalWeight = 0;
  for (let i = 0; i < totalSteps; i++) {
    totalWeight += stepWeight(i, totalSteps);
  }
  return totalWeight;
}

function stepDelayFromTotal(step: number, totalSteps: number, totalWeight: number): number {
  return Math.max(50, Math.round((TOTAL_SPIN_MS * stepWeight(step, totalSteps)) / totalWeight));
}

export function computeStepDelayMs(step: number, totalSteps: number): number {
  if (totalSteps <= 0) return TOTAL_SPIN_MS;
  return stepDelayFromTotal(step, totalSteps, totalStepWeight(totalSteps));
}

export function buildStepOffsetsMs(totalSteps: number): number[] {
  const offsets: number[] = [];
  if (totalSteps <= 0) return offsets;
  const totalWeight = totalStepWeight(totalSteps);
  let elapsed = 0;
  for (let i = 0; i < totalSteps; i++) {
    offsets.push(elapsed);
    elapsed += stepDelayFromTotal(i, totalSteps, totalWeight);
  }
  return offsets;
}

export function totalSpinDurationMs(totalSteps: number): number {
  if (totalSteps <= 0) return 0;
  const totalWeight = totalStepWeight(totalSteps);
  let total = 0;
  for (let i = 0; i < totalSteps; i++) {
    total += stepDelayFromTotal(i, totalSteps, totalWeight);
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
