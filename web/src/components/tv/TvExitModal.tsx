import { Show } from 'solid-js';

interface TvExitModalProps {
  canAbort?: boolean;
  onAbort?: () => void;
  onKeepPlaying: () => void;
  onReload: () => void;
  onExit: () => void;
}

export function TvExitModal(props: TvExitModalProps) {
  return (
    <div class="modal-backdrop">
      <div class="modal-card">
        <h2>{props.canAbort ? 'Game Menu' : 'Leave?'}</h2>
        <div class="modal-actions">
          <button class="btn" onClick={props.onKeepPlaying}>
            Stay
          </button>
          <Show when={props.canAbort && props.onAbort}>
            <button class="btn" onClick={props.onAbort}>
              Abort Game
            </button>
          </Show>
          <button class="btn" onClick={props.onReload}>
            Reload
          </button>
          <button class="btn" onClick={props.onExit}>
            Exit
          </button>
        </div>
      </div>
    </div>
  );
}
