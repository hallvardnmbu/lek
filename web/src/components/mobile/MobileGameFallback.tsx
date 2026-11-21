import type { GameAction, GameInfo } from '../../../../shared/protocol';

interface MobileGameFallbackProps {
  gameInfo: GameInfo | null;
  onSendAction: (action: GameAction) => void;
}

export function MobileGameFallback(props: MobileGameFallbackProps) {
  return (
    <div class="mobile-card">
      <p class="eyebrow">CONTROLLER READY</p>
      <h2>{props.gameInfo?.name ?? 'Active Game'}</h2>
      <p class="muted">
        Register a custom phone controller in <code>web/src/games/index.ts</code>.
      </p>
      <button
        class="btn btn-primary btn-block"
        onClick={() =>
          props.onSendAction({ type: 'ping_action', payload: { ts: Date.now() } })
        }
      >
        Send Test Action
      </button>
    </div>
  );
}
