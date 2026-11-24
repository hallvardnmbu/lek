import { For, createMemo } from 'solid-js';
import type { PlayerSummary } from '../../../../shared/protocol';
import { ArmCrop } from '../ArmCrop';
import { ARMS, type Arm } from '../arms';

interface TvActedArmsProps {
  players: PlayerSummary[];
  actedIds: readonly string[];
}

interface EdgePlacement {
  edge: Arm['enter'];
  pos: string;
}

const TOP_POSITIONS = ['22%', '40%', '58%', '30%'];
const BOTTOM_POSITIONS = ['16%', '36%', '58%', '78%', '26%', '68%', '47%'];
const RIGHT_POSITIONS = ['58%', '34%'];

function placementForSeat(arm: Arm, seat: number): EdgePlacement {
  if (arm.enter === 'top') {
    const slot = seat === 5 ? 0 : seat === 0 ? 1 : seat === 6 ? 2 : 3;
    return { edge: 'top', pos: TOP_POSITIONS[slot % TOP_POSITIONS.length] };
  }
  if (arm.enter === 'right') {
    const slot = seat === 4 ? 0 : 1;
    return { edge: 'right', pos: RIGHT_POSITIONS[slot % RIGHT_POSITIONS.length] };
  }
  const slot =
    seat === 7 ? 0 : seat === 3 ? 1 : seat === 1 ? 2 : seat === 2 ? 3 : seat - 4;
  return {
    edge: 'bottom',
    pos: BOTTOM_POSITIONS[((slot % BOTTOM_POSITIONS.length) + BOTTOM_POSITIONS.length) % BOTTOM_POSITIONS.length],
  };
}

export function TvActedArms(props: TvActedArmsProps) {
  const actedSet = createMemo(() => new Set(props.actedIds));

  return (
    <div class="tv-acted-layer" aria-hidden="true">
      <For each={props.players}>
        {(player) => {
          const arm = () => ARMS[player.seat % ARMS.length];
          const placement = () => placementForSeat(arm(), player.seat);
          const acted = () => actedSet().has(player.id);
          const style = () => {
            const p = placement();
            if (p.edge === 'right') {
              return { top: p.pos };
            }
            return { left: p.pos };
          };

          return (
            <div
              class={`tv-acted-slot edge-${placement().edge} ${acted() ? 'is-acted' : ''}`}
              style={style()}
            >
              <ArmCrop arm={arm()} class="tv-acted-crop" />
              <span class="tv-acted-name">{player.name}</span>
            </div>
          );
        }}
      </For>
    </div>
  );
}
