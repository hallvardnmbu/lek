import { Show, createMemo } from 'solid-js';
import type { RoomState } from '../../../../shared/protocol';
import { PodiumList } from './PodiumList';

interface TvEndedProps {
  state: RoomState;
  onNextRandomGame: () => void;
  onStopRandomized: () => void;
  onChooseAnotherGame: () => void;
  onReturnToLobby: () => void;
}

export function TvEnded(props: TvEndedProps) {
  const sortedPlayers = createMemo(() =>
    [...props.state.players].sort((a, b) => b.score - a.score)
  );

  return (
    <div class="tv-phase-center">
      <Show when={props.state.randomizedMode}>
        <p class="eyebrow">NEXT GAME SOON</p>
      </Show>
      <h1 class="tv-hero-title">Game Over</h1>

      <PodiumList players={sortedPlayers()} />

      <div class="tv-action-bar">
        <Show
          when={props.state.randomizedMode}
          fallback={
            <button class="btn btn-lg" onClick={props.onChooseAnotherGame}>
              Games
            </button>
          }
        >
          <button class="btn btn-lg" onClick={props.onNextRandomGame}>
            Next
          </button>
          <button class="btn btn-lg" onClick={props.onStopRandomized}>
            Stop
          </button>
        </Show>
        <button class="btn btn-lg" onClick={props.onReturnToLobby}>
          Lobby
        </button>
      </div>
    </div>
  );
}
