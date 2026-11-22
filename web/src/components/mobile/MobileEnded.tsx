interface MobileEndedProps {
  score: number;
  onOpenSelector: () => void;
  onReturnToLobby: () => void;
}

export function MobileEnded(props: MobileEndedProps) {
  return (
    <div class="mobile-card">
      <h2>Game Over</h2>
      <p class="muted">Score: {props.score} pts</p>
      <div style={{ display: 'grid', gap: '0.75rem', 'margin-top': '1rem' }}>
        <button class="btn btn-block" onClick={props.onOpenSelector}>
          Choose Game
        </button>
        <button class="btn btn-block" onClick={props.onReturnToLobby}>
          Back to Lobby
        </button>
      </div>
    </div>
  );
}
