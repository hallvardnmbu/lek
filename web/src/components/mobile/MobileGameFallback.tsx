import type { GameAction, GameInfo } from '../../../../shared/protocol';

interface MobileGameFallbackProps {
  gameInfo: GameInfo | null;
  onSendAction: (action: GameAction) => void;
}

export function MobileGameFallback(props: MobileGameFallbackProps) {
  return (
    <div class="mobile-card">
      <h2>{props.gameInfo?.name ?? 'Active Game'}</h2>
      <button
        class="btn btn-block"
        onClick={() =>
          props.onSendAction({ type: 'ping_action', payload: { ts: Date.now() } })
        }
      >
        Send Action
      </button>
    </div>
  );
}
