import { For, Show, createMemo } from 'solid-js';
import type { RoomState } from '../../../../shared/protocol';
import {
  getAvailableGames,
  getConnectedCount,
  getVoteCount,
  getVotersFor,
} from '../../lib/gameSelector';

interface MobileGameSelectorProps {
  state: RoomState;
  playerId: string;
  onVoteGame: (gameId: string) => void;
}

export function MobileGameSelector(props: MobileGameSelectorProps) {
  const mode = () => props.state.gameSelectMode ?? 'CHOOSE';
  const availableGames = createMemo(() => getAvailableGames(props.state));
  const myVote = createMemo(() => props.state.gameVotes?.[props.playerId]);
  const connectedCount = createMemo(() => getConnectedCount(props.state));
  const totalVotes = createMemo(() => getVoteCount(props.state));
  const votesFor = (gameId: string) => getVotersFor(props.state, gameId).length;

  return (
    <div class="mobile-card">
      <Show when={mode() === 'VOTE'} fallback={<h2>Choosing Game</h2>}>
        <h2>Vote</h2>
        <p class="wait-note">
          {totalVotes()}/{connectedCount()} voted
        </p>

        <div class="mobile-game-list">
          <For each={availableGames()}>
            {(game) => {
              const selected = () => myVote() === game.id;
              const count = () => votesFor(game.id);
              return (
                <button
                  class={`btn btn-vote game-item ${selected() ? 'btn-primary' : ''}`}
                  onClick={() => props.onVoteGame(game.id)}
                >
                  <div class="row-between">
                    <strong>{game.name}</strong>
                    <Show when={count() > 0 || selected()}>
                      <span class="vote-count-pill">
                        {selected() ? 'Voted ' : ''}
                        {count() > 0 ? `(${count()})` : ''}
                      </span>
                    </Show>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
