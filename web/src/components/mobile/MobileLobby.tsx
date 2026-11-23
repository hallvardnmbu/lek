import { Show } from 'solid-js';
import type { PlayerSummary, RoomState } from '../../../../shared/protocol';
import { ArmCrop } from '../ArmCrop';
import { ARMS } from '../arms';

interface MobileLobbyProps {
  state: RoomState;
  me: PlayerSummary | null;
  onLeave: () => void;
}

export function MobileLobby(props: MobileLobbyProps) {
  const arm = () => (props.me ? ARMS[props.me.seat] : undefined);

  return (
    <div class="mobile-card">
      <div class="code-tag">ROOM {props.state.code}</div>
      <h2>Lobby</h2>
      <p class="muted">
        {props.state.players.length}/{props.state.maxPlayers} players
      </p>

      <Show when={arm()}>
        {(a) => (
          <div class={`mobile-arm from-${a().enter}`}>
            <ArmCrop arm={a()} class="mobile-arm-crop" />
          </div>
        )}
      </Show>

      <div style={{ display: 'grid', gap: '0.75rem', 'margin-top': '1rem' }}>
        <Show when={props.state.players.length < props.state.minPlayers}>
          <p class="wait-note">
            Need {props.state.minPlayers - props.state.players.length} more
          </p>
        </Show>

        <button class="btn" onClick={props.onLeave}>
          Leave
        </button>
      </div>
    </div>
  );
}
