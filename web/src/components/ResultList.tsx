import { For, Show, createMemo } from 'solid-js';
import type { PlayerSummary } from '../../../shared/protocol';
import { ArmCrop } from './ArmCrop';
import { ARMS } from './arms';

export type ScoreTone = 'accent' | 'loser' | 'muted';

export interface ResultListEntry {
  playerId: string;
  name: string;
  seat?: number;
  swatchColor?: string;
  detail?: string;
  badge?: string;
  badgeTone?: ScoreTone;
  stat?: string;
  tone?: 'accent' | 'loser' | 'default';
  dimmed?: boolean;
}

interface ResultListProps {
  entries: ResultListEntry[];
  players?: PlayerSummary[];
  compact?: boolean;
  class?: string;
}

export function ResultList(props: ResultListProps) {
  const seatsById = createMemo(
    () => new Map((props.players ?? []).map((p) => [p.id, p.seat]))
  );

  return (
    <div class={`result-list ${props.compact ? 'result-compact' : ''} ${props.class ?? ''}`}>
      <For each={props.entries}>
        {(entry) => {
          const seat = () => entry.seat ?? seatsById().get(entry.playerId);
          const arm = () => {
            const s = seat();
            return s !== undefined ? ARMS[s % ARMS.length] : undefined;
          };
          const rowTone = () =>
            entry.tone === 'accent'
              ? 'is-accent'
              : entry.tone === 'loser'
                ? 'is-loser'
                : '';

          return (
            <div class={`result-row ${rowTone()} ${entry.dimmed ? 'is-dimmed' : ''}`}>
              <Show when={entry.swatchColor}>
                {(color) => <span class="result-swatch" style={{ background: color() }} />}
              </Show>
              <Show when={!entry.swatchColor && arm()}>
                {(a) => (
                  <div class={`tally-arm from-${a().enter}`}>
                    <ArmCrop arm={a()} class="tally-arm-crop" />
                  </div>
                )}
              </Show>
              <span class="result-name">{entry.name}</span>
              <Show when={entry.detail}>
                <span class="result-detail">{entry.detail}</span>
              </Show>
              <Show when={entry.badge}>
                <span class={`status-badge badge-${entry.badgeTone ?? 'muted'}`}>
                  {entry.badge}
                </span>
              </Show>
              <Show when={entry.stat}>
                <span class="result-stat">{entry.stat}</span>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}
