import { For, Show } from 'solid-js';
import type { RoomState } from '../../../../shared/protocol';

interface MobileGameSelectorProps {
  state: RoomState;
  isVip: boolean;
  onStartGame: (gameId: string) => void;
  onReturnToLobby: () => void;
}

export function MobileGameSelector(props: MobileGameSelectorProps) {
  return (
    <div class="mobile-card">
      <h2>Pick a Game</h2>
      <Show
        when={props.isVip}
        fallback={
          <p class="wait-note">Waiting for host...</p>
        }
      >
        <div class="mobile-game-list">
          <For each={props.state.games}>
            {(game) => {
              const tooFew = () => props.state.players.length < game.minPlayers;
              return (
                <button
                  class="btn mobile-game-btn"
                  disabled={tooFew()}
                  onClick={() => props.onStartGame(game.id)}
                >
                  <strong>{game.name}</strong>
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
