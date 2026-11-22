import { For, Show, createMemo } from 'solid-js';
import type { PlayerSummary, RoomState } from '../../../../shared/protocol';
import { ARMS, armSrc, type Arm } from '../arms';
import { QrCode } from '../QrCode';

interface TvLobbyProps {
  state: RoomState;
  joinUrl: string;
  canEnterSelector: boolean;
  muted: boolean;
  onToggleSound: () => void;
  onOpenSelector: () => void;
}

function ArmSlot(props: { arm: Arm; player: PlayerSummary | undefined }) {
  const name = createMemo((prev?: string) => props.player?.name ?? prev ?? '');
  const stateClass = () => {
    if (!props.player) return '';
    return props.player.connected ? 'seated' : 'seated disconnected';
  };

  return (
    <div class={`lobby-arm from-${props.arm.enter} ${stateClass()}`}>
      <img class="lobby-arm-img" src={armSrc(props.arm)} alt="" />
      <span
        class="lobby-arm-name"
        style={{
          left: `${props.arm.label.x}%`,
          top: `${props.arm.label.y}%`,
          transform: `translate(-50%, -50%) rotate(${props.arm.label.angle}deg)`,
        }}
      >
        {name()}
      </span>
    </div>
  );
}

export function TvLobby(props: TvLobbyProps) {
  const playerAt = (seat: number) => props.state.players.find((p) => p.seat === seat);
  const extra = () => props.state.players.filter((p) => p.seat >= ARMS.length);

  return (
    <div class="tv-lobby">
      <div class="tv-lobby-stage">
        <For each={ARMS}>{(arm, idx) => <ArmSlot arm={arm} player={playerAt(idx())} />}</For>

        <h2 class="lobby-title">PLAYERS</h2>

        <Show when={extra().length > 0}>
          <div class="lobby-extra-names">
            <For each={extra()}>{(player) => <span>{player.name}</span>}</For>
          </div>
        </Show>

        <section class="lobby-join-card">
          <div class="qr-frame">
            <QrCode value={props.joinUrl} size={280} />
          </div>
          <div class="lobby-code">{props.state.code}</div>
          <button
            class="btn lobby-start-btn"
            disabled={!props.canEnterSelector}
            onClick={props.onOpenSelector}
          >
            {props.canEnterSelector
              ? 'Start'
              : `Waiting for ${Math.max(0, props.state.minPlayers - props.state.players.length)} more...`}
          </button>
          <button class="lobby-card-label lobby-sound-btn" onClick={props.onToggleSound}>
            {props.muted ? 'SOUND OFF' : 'SOUND ON'}
          </button>
        </section>
      </div>
    </div>
  );
}
