import { For, Show } from 'solid-js';
import type { GameInfo, RoomState } from '../../../../shared/protocol';

interface TvGameFallbackProps {
  state: RoomState;
  gameInfo: GameInfo | null;
  lastEvent: { event: string; payload: unknown; at: number } | null;
  onEndGame: () => void;
}

export function TvGameFallback(props: TvGameFallbackProps) {
  return (
    <div class="tv-phase-center">
      <h1 class="tv-hero-title">{props.gameInfo?.name ?? 'Active Game'}</h1>

      <div class="status-pills-grid">
        <For each={props.state.players}>
          {(p) => (
            <div class={`status-pill ${p.connected ? 'done' : ''}`}>
              <span>{p.name}</span>
              <span>{p.score} pts</span>
            </div>
          )}
        </For>
      </div>

      <Show when={props.lastEvent}>
        {(ev) => (
          <p class="tv-hero-sub">
            Last event: <strong>{ev().event}</strong>
          </p>
        )}
      </Show>

      <div class="tv-action-bar">
        <button class="btn" onClick={props.onEndGame}>
          End
        </button>
      </div>
    </div>
  );
}
