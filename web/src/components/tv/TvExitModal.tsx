interface TvExitModalProps {
  onKeepPlaying: () => void;
  onReload: () => void;
  onExit: () => void;
}

export function TvExitModal(props: TvExitModalProps) {
  return (
    <div class="modal-backdrop">
      <div class="modal-card">
        <h2>Leave Room?</h2>
        <p>Current room session will be paused if you exit.</p>
        <div class="modal-actions">
          <button class="btn" onClick={props.onKeepPlaying}>
            Keep Playing
          </button>
          <button class="btn" onClick={props.onReload}>
            Reload
          </button>
          <button class="btn" onClick={props.onExit}>
            Exit App
          </button>
        </div>
      </div>
    </div>
  );
}
