import { For, Show, createMemo } from 'solid-js';
import type { PlayerSummary } from '../../../../shared/protocol';
import { ArmCrop } from '../ArmCrop';
import { ARMS } from '../arms';

interface PodiumListProps {
  players: PlayerSummary[];
  compact?: boolean;
  class?: string;
}

export function PodiumList(props: PodiumListProps) {
  const maxScore = createMemo(() =>
    Math.max(0, ...props.players.map((p) => p.score))
  );

  const hasSessionTotals = createMemo(() =>
    props.players.some((p) => p.totalScore !== p.score)
  );

  return (
    <div class={`podium-list ${props.class ?? ''}`}>
      <For each={props.players}>
        {(p, idx) => {
          const arm = () => ARMS[p.seat];
          const fillPct = () => (maxScore() > 0 ? (p.score / maxScore()) * 100 : 0);
          const isWinner = () => idx() === 0 && p.score > 0;
          return (
            <div
              class={`podium-row rank-${idx() + 1} ${!props.compact && isWinner() ? 'is-winner' : ''} ${!props.compact && !p.connected ? 'disconnected' : ''}`}
              style={props.compact ? undefined : { 'animation-delay': `${idx() * 90}ms` }}
            >
              <Show when={!props.compact}>
                <div class="podium-bar">
                  <div class="podium-fill" style={{ width: `${fillPct()}%` }} />
                </div>
              </Show>
              <span class="rank-num">#{idx() + 1}</span>
              <Show when={!props.compact && arm()}>
                {(a) => (
                  <div class={`podium-arm from-${a().enter}`}>
                    <ArmCrop arm={a()} class="podium-arm-crop" />
                  </div>
                )}
              </Show>
              <span class="podium-name">{p.name}</span>
              <Show when={!props.compact && isWinner()}>
                <span class="podium-badge">WINNER</span>
              </Show>
              <Show
                when={!props.compact}
                fallback={<span class="podium-score">{p.score} pts</span>}
              >
                <span class="podium-score">
                  <span class="podium-score-num">{p.score}</span>
                  <span class="podium-score-unit">pts</span>
                  <Show when={hasSessionTotals()}>
                    <span class="podium-score-total">· {p.totalScore} total</span>
                  </Show>
                </span>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}
