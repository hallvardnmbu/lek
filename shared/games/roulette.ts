export type RoulettePhase = 'SPINNING' | 'STOPPED';

export interface RoulettePlayerEntry {
  id: string;
  name: string;
  isActive: boolean;
  isSelected: boolean;
}

export interface RouletteState {
  phase: RoulettePhase;
  playerOrder: string[];
  activeIndex: number;
  step: number;
  totalSteps: number;
  selectedId: string | null;
}

export interface RouletteHostView {
  phase: RoulettePhase;
  players: RoulettePlayerEntry[];
  selectedName: string | null;
}

export interface RoulettePlayerView {
  phase: RoulettePhase;
  isActive: boolean;
  isSelected: boolean;
  selectedName: string | null;
}
