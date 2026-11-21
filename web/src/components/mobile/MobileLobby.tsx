import { Show } from 'solid-js';
import type { RoomState } from '../../../../shared/protocol';

interface MobileLobbyProps {
  state: RoomState;
  isVip: boolean;
  onOpenSelector: () => void;
  onLeave: () => void;
}

export function MobileLobby(props: MobileLobbyProps) {
  return (
    <div class="mobile-card">
      <div class="code-tag">ROOM {props.state.code}</div>
      <h2>Lobby</h2>
      <p class="muted">
        {props.state.players.length}/{props.state.maxPlayers} players
      </p>

      <div style={{ display: 'grid', gap: '0.75rem', 'margin-top': '1rem' }}>
        <Show
          when={props.isVip}
          fallback={<p class="wait-note">Waiting for host...</p>}
        >
          <button
            class="btn btn-block"
            disabled={props.state.players.length < props.state.minPlayers}
            onClick={props.onOpenSelector}
          >
            {props.state.players.length >= props.state.minPlayers
              ? 'Choose Game'
              : `Need ${props.state.minPlayers - props.state.players.length} more`}
          </button>
        </Show>

        <button class="btn btn-block" onClick={props.onLeave}>
          Leave Room
        </button>
      </div>
    </div>
  );
}
