interface MobileEndedProps {
  score: number;
  randomizedMode?: boolean;
}

export function MobileEnded(props: MobileEndedProps) {
  return (
    <div class="mobile-card">
      <h2>Game Over</h2>
      <p class="wait-note">
        {props.randomizedMode ? 'Next game soon' : 'Waiting for host'}
      </p>
    </div>
  );
}
