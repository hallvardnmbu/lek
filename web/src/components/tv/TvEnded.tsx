import { For, createMemo } from 'solid-js';
import type { RoomState } from '../../../../shared/protocol';

interface TvEndedProps {
  state: RoomState;
  onChooseAnotherGame: () => void;
  onReturnToLobby: () => void;
}

export function TvEnded(props: TvEndedProps) {
  const sortedPlayers = createMemo(() =>
    [...props.state.players].sort((a, b) => b.score - a.score)
  );

  return (
    <div class="tv-phase-center">
      <h1 class="tv-hero-title">Game Over</h1>

      <div class="podium-list">
        <For each={sortedPlayers()}>
          {(p, idx) => (
            <div class={`podium-row rank-${idx() + 1}`}>
              <span class="rank-num">#{idx() + 1}</span>
              <span class="podium-name">{p.name}</span>
              <span class="podium-score">{p.score} pts</span>
            </div>
          )}
        </For>
      </div>

      <div
        class="tv-action-bar"
        style={{ display: 'flex', gap: '1rem', 'justify-content': 'center' }}
      >
        <button class="btn btn-tv" onClick={props.onChooseAnotherGame}>
          Choose Game
        </button>
        <button class="btn btn-tv" onClick={props.onReturnToLobby}>
          Back to Lobby
        </button>
      </div>
    </div>
  );
}
