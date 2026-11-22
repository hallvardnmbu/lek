import { For, Show } from 'solid-js';

export interface TallyListEntry {
  playerId: string;
  name: string;
  votes: number;
  highlighted: boolean;
}

interface TallyListProps {
  entries: TallyListEntry[];
  badgeLabel: string;
  tone?: 'accent' | 'danger';
  compact?: boolean;
}

export function TallyList(props: TallyListProps) {
  const maxVotes = () => Math.max(1, props.entries[0]?.votes ?? 0);
  const tone = () => props.tone ?? 'accent';

  return (
    <div class={`tally-list ${props.compact ? 'tally-compact' : ''}`}>
      <For each={props.entries}>
        {(entry) => (
          <div class={`tally-row ${entry.highlighted ? `tally-highlighted tally-${tone()}` : ''}`}>
            <Show when={entry.highlighted}>
              <span class="tally-badge">{props.badgeLabel}</span>
            </Show>
            <span class="tally-name">{entry.name}</span>
            <span class="tally-votes">
              {entry.votes} {entry.votes === 1 ? 'vote' : 'votes'}
            </span>
            <div class="tally-bar">
              <div class="tally-fill" style={{ width: `${(entry.votes / maxVotes()) * 100}%` }} />
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
