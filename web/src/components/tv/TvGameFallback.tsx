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
      <p class="eyebrow">GAME IN PROGRESS</p>
      <h1 class="tv-hero-title">{props.gameInfo?.name ?? 'Active Game'}</h1>
      <p class="tv-hero-sub">
        Players are connected on their phones. Register a custom TV view in{' '}
        <code>web/src/games/index.ts</code>.
      </p>

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
        <button class="btn btn-secondary" onClick={props.onEndGame}>
          End Game
        </button>
      </div>
    </div>
  );
}
