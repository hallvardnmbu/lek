import type { JSX } from '@solidjs/web';
import type { GameAction, RoomState } from '../../../shared/protocol';

export interface TvGameViewProps<THostState = unknown> {
  state: RoomState<THostState, unknown>;
  remainingMs: number | null;
  lastEvent: { event: string; payload: unknown; at: number } | null;
  sendAction: (action: GameAction) => void;
  endGame: () => void;
}

export interface MobileGameViewProps<TPlayerState = unknown> {
  state: RoomState<unknown, TPlayerState>;
  playerId: string;
  remainingMs: number | null;
  lastEvent: { event: string; payload: unknown; at: number } | null;
  sendAction: (action: GameAction) => void;
}

export interface GameUiDefinition<THostState = any, TPlayerState = any> {
  id: string;
  name: string;
  TvView: (props: TvGameViewProps<THostState>) => JSX.Element;
  MobileView: (props: MobileGameViewProps<TPlayerState>) => JSX.Element;
}

const uiRegistry = new Map<string, GameUiDefinition>();

export function registerGameUi<THostState, TPlayerState>(
  def: GameUiDefinition<THostState, TPlayerState>
): void {
  uiRegistry.set(def.id, def);
}

export function secondsLeft(remainingMs: number | null): number {
  return Math.ceil((remainingMs ?? 0) / 1000);
}

export function getGameUi(id: string | null | undefined): GameUiDefinition | undefined {
  if (!id) return undefined;
  return uiRegistry.get(id);
}
