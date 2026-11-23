import { For, Show, createMemo } from 'solid-js';
import type { RoomState } from '../../../../shared/protocol';
import { ArmCrop } from '../ArmCrop';
import { ARMS } from '../arms';

interface TvEndedProps {
  state: RoomState;
  onNextRandomGame: () => void;
  onStopRandomized: () => void;
  onChooseAnotherGame: () => void;
  onReturnToLobby: () => void;
}

export function TvEnded(props: TvEndedProps) {
  const sortedPlayers = createMemo(() =>
    [...props.state.players].sort((a, b) => b.score - a.score)
  );

  const maxScore = createMemo(() =>
    Math.max(0, ...sortedPlayers().map((p) => p.score))
  );

  return (
    <div class="tv-phase-center">
      <Show when={props.state.randomizedMode}>
        <p class="eyebrow">NEXT GAME SOON</p>
      </Show>
      <h1 class="tv-hero-title">Game Over</h1>

      <div class="podium-list">
        <For each={sortedPlayers()}>
          {(p, idx) => {
            const arm = () => ARMS[p.seat];
            const fillPct = () => (maxScore() > 0 ? (p.score / maxScore()) * 100 : 0);
            const isWinner = () => idx() === 0 && p.score > 0;
            return (
              <div
                class={`podium-row rank-${idx() + 1} ${isWinner() ? 'is-winner' : ''} ${p.connected ? '' : 'disconnected'}`}
                style={{ 'animation-delay': `${idx() * 90}ms` }}
              >
                <div class="podium-bar">
                  <div class="podium-fill" style={{ width: `${fillPct()}%` }} />
                </div>
                <span class="rank-num">#{idx() + 1}</span>
                <Show when={arm()}>
                  {(a) => (
                    <div class={`podium-arm from-${a().enter}`}>
                      <ArmCrop arm={a()} class="podium-arm-crop" />
                    </div>
                  )}
                </Show>
                <span class="podium-name">{p.name}</span>
                <Show when={isWinner()}>
                  <span class="podium-badge">WINNER</span>
                </Show>
                <span class="podium-score">
                  <span class="podium-score-num">{p.score}</span>
                  <span class="podium-score-unit">pts</span>
                </span>
              </div>
            );
          }}
        </For>
      </div>

      <div class="tv-action-bar">
        <Show
          when={props.state.randomizedMode}
          fallback={
            <button class="btn btn-lg" onClick={props.onChooseAnotherGame}>
              Games
            </button>
          }
        >
          <button class="btn btn-lg" onClick={props.onNextRandomGame}>
            Next
          </button>
          <button class="btn btn-lg" onClick={props.onStopRandomized}>
            Stop
          </button>
        </Show>
        <button class="btn btn-lg" onClick={props.onReturnToLobby}>
          Lobby
        </button>
      </div>
    </div>
  );
}
