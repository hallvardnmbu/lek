import { Show } from 'solid-js';

interface MobileEndedProps {
  score: number;
  totalScore: number;
  randomizedMode?: boolean;
}

export function MobileEnded(props: MobileEndedProps) {
  return (
    <div class="mobile-card">
      <h2>Game Over</h2>
      <p class="muted">
        {props.score} pts
        <Show when={props.totalScore !== props.score}>
          {' '}
          · {props.totalScore} total
        </Show>
      </p>
      <p class="wait-note">
        {props.randomizedMode ? 'Next game soon' : 'Waiting for host'}
      </p>
    </div>
  );
}
