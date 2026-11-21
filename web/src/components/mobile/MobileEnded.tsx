import { Show } from 'solid-js';

interface MobileEndedProps {
  score: number;
  isVip: boolean;
  onOpenSelector: () => void;
  onReturnToLobby: () => void;
}

export function MobileEnded(props: MobileEndedProps) {
  return (
    <div class="mobile-card">
      <h2>Game Over!</h2>
      <p class="muted">Your final score: {props.score} pts</p>
      <Show when={props.isVip}>
        <div style={{ display: 'grid', gap: '0.75rem', 'margin-top': '1rem' }}>
          <button class="btn btn-primary btn-block" onClick={props.onOpenSelector}>
            Choose Another Game
          </button>
          <button class="btn btn-secondary btn-block" onClick={props.onReturnToLobby}>
            Back to Lobby
          </button>
        </div>
      </Show>
    </div>
  );
}
