import { For, Show, createMemo } from 'solid-js';
import type { GameSelectMode, RoomState } from '../../../../shared/protocol';

interface TvGameSelectorProps {
  state: RoomState;
  onSelectMode: (mode: GameSelectMode) => void;
  onStartRandomGame: () => void;
  onStartGame: (gameId: string) => void;
  onReturnToLobby: () => void;
}

export function TvGameSelector(props: TvGameSelectorProps) {
  const mode = () => props.state.gameSelectMode ?? 'CHOOSE';

  const availableGames = createMemo(() =>
    props.state.games.filter(
      (g) =>
        props.state.players.length >= g.minPlayers &&
        props.state.players.length <= g.maxPlayers
    )
  );

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
      <Show
        when={mode() === 'VOTE'}
        fallback={
          <>
            <div class="selector-header">
              <h1 class="tv-hero-title">Play</h1>
            </div>

            <div class="tv-choices">
              <button
                class="btn"
                disabled={availableGames().length === 0}
                onClick={props.onStartRandomGame}
              >
                Random
              </button>

              <button class="btn" onClick={() => props.onSelectMode('VOTE')}>
                Vote
              </button>
            </div>
          </>
        }
      >
        <div class="selector-header">
          <h1 class="tv-hero-title">Vote</h1>
          <p class="selector-subtitle">
            {voteCount()}/{connectedCount()} voted
          </p>
        </div>

        <div class="game-grid">
          <For each={availableGames()}>
            {(game) => {
              const voters = () => votersFor(game.id);
              return (
                <button
                  class="btn btn-vote game-item"
                  onClick={() => props.onStartGame(game.id)}
                >
                  <div class="row-between">
                    <div class="game-card-title">{game.name}</div>
                    <Show when={voters().length > 0}>
                      <span class="vote-count-pill">
                        {voters().length} {voters().length === 1 ? 'vote' : 'votes'}
                      </span>
                    </Show>
                  </div>
                  <Show when={voters().length > 0}>
                    <div class="game-card-meta">
                      {voters()
                        .map((v) => v.name)
                        .join(', ')}
                    </div>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </Show>

      <div class="tv-action-bar">
        <button class="btn" onClick={props.onReturnToLobby}>
          Lobby
        </button>
      </div>
    </div>
  );
}
