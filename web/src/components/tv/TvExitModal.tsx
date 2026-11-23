interface TvExitModalProps {
  onKeepPlaying: () => void;
  onReload: () => void;
  onExit: () => void;
}

export function TvExitModal(props: TvExitModalProps) {
  return (
    <div class="modal-backdrop">
      <div class="modal-card">
        <h2>Leave?</h2>
        <div class="modal-actions">
          <button class="btn" onClick={props.onKeepPlaying}>
            Stay
          </button>
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
