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

  const hasEligibleGame = createMemo(() =>
    props.state.games.some(
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
              <h1 class="tv-hero-title">Choose a Game</h1>
              <p class="selector-subtitle">Pick a random game or vote together</p>
            </div>

            <div class="game-grid">
              <button
                class="btn game-card"
                disabled={!hasEligibleGame()}
                onClick={props.onStartRandomGame}
              >
                <div class="game-card-top">
                  <div class="game-card-title">Randomized</div>
                </div>
                <div class="game-card-desc">Jump straight into a random game</div>
              </button>

              <button class="btn game-card" onClick={() => props.onSelectMode('VOTE')}>
                <div class="game-card-top">
                  <div class="game-card-title">Vote</div>
                </div>
                <div class="game-card-desc">Everyone votes on their phone</div>
              </button>
            </div>
          </>
        }
      >
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
      </Show>

      <div class="tv-action-bar">
        <button class="btn" onClick={props.onReturnToLobby}>
          Back to Lobby
        </button>
      </div>
    </div>
  );
}
