import { For, Show } from 'solid-js';
import type { RoomState } from '../../../../shared/protocol';

interface TvGameSelectorProps {
  state: RoomState;
  onStartGame: (gameId: string) => void;
  onReturnToLobby: () => void;
}

export function TvGameSelector(props: TvGameSelectorProps) {
  return (
    <div class="game-selector-stage">
      <div class="selector-header">
        <h1 class="tv-hero-title">Pick a Game</h1>
      </div>

      <div class="game-grid">
        <For each={props.state.games}>
          {(game) => {
            const tooFew = () => props.state.players.length < game.minPlayers;
            return (
              <button
                class="btn game-card"
                disabled={tooFew()}
                onClick={() => props.onStartGame(game.id)}
              >
                <div class="game-card-title">{game.name}</div>
                <Show when={game.description}>
                  <div class="game-card-desc">{game.description}</div>
                </Show>
                <div class="game-card-meta">
                  {game.minPlayers}–{game.maxPlayers} players
                  {tooFew() ? ` (need ${game.minPlayers})` : ''}
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
