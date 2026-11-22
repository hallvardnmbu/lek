import { For, Show, createMemo } from 'solid-js';
import type { RoomState } from '../../../../shared/protocol';

interface MobileGameSelectorProps {
  state: RoomState;
  playerId: string;
  isVip: boolean;
  onVoteGame: (gameId: string) => void;
  onReturnToLobby: () => void;
}

export function MobileGameSelector(props: MobileGameSelectorProps) {
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
      <h2>Vote for a Game</h2>
      <p class="wait-note">
        {totalVotes()} / {connectedCount()} voted
        {myVote() ? ' · Waiting for others...' : ' · Tap a game to vote'}
      </p>

      <div class="mobile-game-list">
        <For each={props.state.games}>
          {(game) => {
            const tooFew = () => props.state.players.length < game.minPlayers;
            const selected = () => myVote() === game.id;
            const count = () => votesFor(game.id);
            return (
              <button
                class={`btn mobile-game-btn ${selected() ? 'btn-primary' : ''}`}
                disabled={tooFew()}
                onClick={() => props.onVoteGame(game.id)}
              >
                <div class="mobile-game-top">
                  <strong>{game.name}</strong>
                  <Show when={count() > 0 || selected()}>
                    <span class="mobile-vote-tag">
                      {selected() ? 'Your vote' : ''}
                      {selected() && count() > 0 ? ' · ' : ''}
                      {count() > 0 ? `${count()} ${count() === 1 ? 'vote' : 'votes'}` : ''}
                    </span>
                  </Show>
                </div>
                <Show when={game.description}>
                  <span class="mobile-game-desc">{game.description}</span>
                </Show>
                <small class="mobile-game-meta">
                  {game.minPlayers}–{game.maxPlayers} players
                  {tooFew() ? ` (need ${game.minPlayers})` : ''}
                </small>
              </button>
            );
          }}
        </For>
      </div>

      <Show when={props.isVip}>
        <button
          class="btn btn-block"
          style={{ 'margin-top': '0.85rem' }}
          onClick={props.onReturnToLobby}
        >
          Back to Lobby
        </button>
      </Show>
    </div>
  );
}
