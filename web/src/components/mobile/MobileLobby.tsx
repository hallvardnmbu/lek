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
      <h2>You&apos;re in!</h2>
      <p class="muted">
        {props.state.players.length} / {props.state.maxPlayers} players connected.
      </p>

      <Show
        when={props.isVip}
        fallback={<p class="wait-note">Waiting for VIP or TV to continue...</p>}
      >
        <button
          class="btn btn-primary btn-block"
          disabled={props.state.players.length < props.state.minPlayers}
          onClick={props.onOpenSelector}
        >
          {props.state.players.length >= props.state.minPlayers
            ? 'Choose Game'
            : `Need ${props.state.minPlayers - props.state.players.length} more player(s)`}
        </button>
      </Show>

      <button class="btn btn-ghost btn-block" onClick={props.onLeave}>
        Leave Room
      </button>
    </div>
  );
}
