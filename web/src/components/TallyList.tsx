import { For, Show, createMemo } from 'solid-js';
import type { PlayerSummary } from '../../../shared/protocol';
import { ArmCrop } from './ArmCrop';
import { ARMS } from './arms';

export interface TallyListEntry {
  playerId: string;
  name: string;
  votes: number;
  highlighted: boolean;
  seat?: number;
}

interface TallyListProps {
  entries: TallyListEntry[];
  players?: PlayerSummary[];
  badgeLabel: string;
  tone?: 'accent' | 'loser' | 'danger';
  compact?: boolean;
}

export function TallyList(props: TallyListProps) {
  const maxVotes = () => Math.max(1, props.entries[0]?.votes ?? 0);
  const resolvedTone = () => (props.tone === 'danger' || props.tone === 'loser' ? 'loser' : 'accent');
  const seatsById = createMemo(
    () => new Map((props.players ?? []).map((p) => [p.id, p.seat]))
  );

  return (
    <div class={`tally-list ${props.compact ? 'tally-compact' : ''}`}>
      <For each={props.entries}>
        {(entry) => {
          const seat = () => entry.seat ?? seatsById().get(entry.playerId);
          const arm = () => {
            const s = seat();
            return s !== undefined ? ARMS[s % ARMS.length] : undefined;
          };

          return (
            <div
              class={`tally-row ${entry.highlighted ? `tally-highlighted tally-${resolvedTone()}` : ''}`}
            >
              <div class="tally-bar">
                <div class="tally-fill" style={{ width: `${(entry.votes / maxVotes()) * 100}%` }} />
              </div>
              <Show when={arm()}>
                {(a) => (
                  <div class={`tally-arm from-${a().enter}`}>
                    <ArmCrop arm={a()} class="tally-arm-crop" />
                  </div>
                )}
              </Show>
              <span class="tally-name">{entry.name}</span>
              <Show when={entry.highlighted}>
                <span class={`status-badge badge-${resolvedTone()} tally-badge`}>
                  {props.badgeLabel}
                </span>
              </Show>
              <span class="tally-votes">
                {entry.votes} {entry.votes === 1 ? 'vote' : 'votes'}
              </span>
            </div>
          );
        }}
      </For>
    </div>
  );
}
