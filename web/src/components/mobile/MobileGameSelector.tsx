import { For, Show, createMemo } from 'solid-js';
import type { RoomState } from '../../../../shared/protocol';

interface MobileGameSelectorProps {
  state: RoomState;
  playerId: string;
  onVoteGame: (gameId: string) => void;
}

export function MobileGameSelector(props: MobileGameSelectorProps) {
  const mode = () => props.state.gameSelectMode ?? 'CHOOSE';

  const availableGames = createMemo(() =>
    props.state.games.filter(
      (g) =>
        props.state.players.length >= g.minPlayers &&
        props.state.players.length <= g.maxPlayers
    )
  );

  const myVote = createMemo(() => props.state.gameVotes?.[props.playerId]);

  const connectedCount = createMemo(
    () => props.state.players.filter((p) => p.connected).length
  );

  const totalVotes = createMemo(() => {
    const votes = props.state.gameVotes ?? {};
    return props.state.players.filter((p) => p.connected && Boolean(votes[p.id])).length;
  });

  const votesFor = (gameId: string) => {
    const votes = props.state.gameVotes ?? {};
    return props.state.players.filter((p) => p.connected && votes[p.id] === gameId).length;
  };

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
