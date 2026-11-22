import { For, Show, createMemo } from 'solid-js';
import type { RoomState } from '../../../../shared/protocol';

interface TvGameSelectorProps {
  state: RoomState;
  onStartGame: (gameId: string) => void;
  onReturnToLobby: () => void;
}

export function TvGameSelector(props: TvGameSelectorProps) {
  const connectedCount = createMemo(
    () => props.state.players.filter((p) => p.connected).length
  );

  const voteCount = createMemo(() => {
    const votes = props.state.gameVotes ?? {};
    return props.state.players.filter((p) => p.connected && Boolean(votes[p.id])).length;
  });

  const votersFor = (gameId: string) => {
    const votes = props.state.gameVotes ?? {};
    return props.state.players.filter((p) => p.connected && votes[p.id] === gameId);
  };

  return (
    <div class="game-selector-stage">
      <div class="selector-header">
        <h1 class="tv-hero-title">Vote for a Game</h1>
        <p class="selector-subtitle">
          {voteCount()} / {connectedCount()} voted · Select on TV to override
        </p>
      </div>

      <div class="game-grid">
        <For each={props.state.games}>
          {(game) => {
            const tooFew = () => props.state.players.length < game.minPlayers;
            const voters = () => votersFor(game.id);
            return (
              <button
                class="btn game-card"
                disabled={tooFew()}
                onClick={() => props.onStartGame(game.id)}
              >
                <div class="game-card-top">
                  <div class="game-card-title">{game.name}</div>
                  <Show when={voters().length > 0}>
                    <span class="vote-count-pill">
                      {voters().length} {voters().length === 1 ? 'vote' : 'votes'}
                    </span>
                  </Show>
                </div>
                <Show when={game.description}>
                  <div class="game-card-desc">{game.description}</div>
                </Show>
                <div class="game-card-meta">
                  <span>
                    {game.minPlayers}–{game.maxPlayers} players
                    {tooFew() ? ` (need ${game.minPlayers})` : ''}
                  </span>
                  <Show when={voters().length > 0}>
                    <span class="game-card-voters">
                      {voters()
                        .map((v) => v.name)
                        .join(', ')}
                    </span>
                  </Show>
                </div>
              </button>
            );
          }}
        </For>
      </div>

      <div class="tv-action-bar">
        <button class="btn" onClick={props.onReturnToLobby}>
          Back to Lobby
        </button>
      </div>
    </div>
  );
}
