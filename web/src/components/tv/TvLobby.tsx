import { For } from 'solid-js';
import type { RoomState } from '../../../../shared/protocol';
import { QrCode } from '../QrCode';
import { CocktailCard } from './CocktailCard';

interface TvLobbyProps {
  state: RoomState;
  joinUrl: string;
  canEnterSelector: boolean;
  onOpenSelector: () => void;
}

export function TvLobby(props: TvLobbyProps) {
  return (
    <div class="tv-lobby-grid">
      <section class="tv-join-panel">
        <p class="eyebrow">SCAN TO JOIN</p>
        <div class="qr-frame">
          <QrCode value={props.joinUrl} size={280} />
        </div>
        <div class="join-url-text">{props.joinUrl}</div>
        <div class="big-code">{props.state.code}</div>
      </section>

      <section class="tv-players-panel">
        <div class="panel-header">
          <h2>
            Players ({props.state.players.length}/{props.state.maxPlayers})
          </h2>
        </div>

        <div class="player-grid">
          <For each={props.state.players}>
            {(player) => <CocktailCard player={player} />}
          </For>
        </div>

        <div class="tv-action-bar">
          <button
            class="btn btn-tv"
            disabled={!props.canEnterSelector}
            onClick={props.onOpenSelector}
          >
            {props.canEnterSelector
              ? 'Choose Game'
              : `Waiting for ${Math.max(0, props.state.minPlayers - props.state.players.length)} more...`}
          </button>
        </div>
      </section>
    </div>
  );
}
