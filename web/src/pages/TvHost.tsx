import { Show, createMemo, createSignal, onSettled } from 'solid-js';
import { TvExitModal } from '../components/tv/TvExitModal';
import { TvStage } from '../components/tv/TvStage';
import { createLobbyMusic } from '../lib/audio';
import { createDpadNav } from '../lib/dpad';
import { exitTizenApp, initTizenTv, reloadApp } from '../lib/tizen';
import { createGameSocket, loadHostToken, saveHostToken } from '../lib/ws';

export function TvHost() {
  const [hostToken, setHostToken] = createSignal<string | undefined>(loadHostToken());
  const [showExitModal, setShowExitModal] = createSignal(false);
  let canvasRef: HTMLDivElement | undefined;

  const socket = createGameSocket({
    onOpen(send) {
      send({ type: 'create_room', payload: { hostToken: hostToken() } });
    },
    onMessage(msg) {
      if (msg.type === 'room_created') {
        setHostToken(msg.payload.hostToken);
        saveHostToken(msg.payload.hostToken);
      }
    },
  });

  const state = () => socket.roomState();

  const secondsLeft = createMemo(() => {
    const ms = socket.remainingMs();
    return ms === null ? null : Math.ceil(ms / 1000);
  });

  onSettled(() => {
    initTizenTv();
  });

  createDpadNav(() => canvasRef, {
    onReturn: () => setShowExitModal((prev) => !prev),
  });

  const lobbyMusic = createLobbyMusic('/lobby.mp3', () => {
    const phase = state()?.phase;
    return phase === 'LOBBY' || phase === 'GAME_SELECT';
  });

  return (
    <div class="tv-viewport">
      <div
        class={`tv-canvas ${state()?.phase === 'LOBBY' ? 'tv-canvas-lobby' : ''}`}
        ref={(el) => (canvasRef = el)}
      >
        <header class="tv-header">
          <div class="tv-brand">
            <span class="tv-logo">Party</span>
            <Show when={!socket.connected()}>
              <span class="conn-pill offline">RECONNECTING...</span>
            </Show>
          </div>

          <Show when={state()}>
            {(s) => (
              <div class="tv-room-strip">
                <button
                  class={`audio-pill ${lobbyMusic.muted() ? 'muted' : ''}`}
                  onClick={lobbyMusic.toggleMute}
                >
                  {lobbyMusic.muted() ? 'Sound: Off' : 'Sound: On'}
                </button>
                <Show when={secondsLeft() !== null}>
                  <div class={`timer-pill ${(secondsLeft() ?? 99) <= 5 ? 'urgent' : ''}`}>
                    {secondsLeft()}s
                  </div>
                </Show>
                <div class="room-code-badge">
                  ROOM <strong>{s().code}</strong>
                </div>
              </div>
            )}
          </Show>
        </header>

        <Show when={socket.error()}>
          <div class="tv-toast-error">{socket.error()}</div>
        </Show>

        <Show
          when={state()}
          fallback={
            <div class="tv-center-loading">
              <div class="spinner" />
              <p>Creating room...</p>
            </div>
          }
        >
          {(s) => (
            <TvStage
              state={s()}
              hostToken={hostToken()}
              remainingMs={socket.remainingMs()}
              lastEvent={socket.lastEvent()}
              muted={lobbyMusic.muted()}
              onToggleSound={lobbyMusic.toggleMute}
              send={socket.send}
              sendAction={(action) => socket.sendAction(action, { hostToken: hostToken() })}
            />
          )}
        </Show>

        <Show when={showExitModal()}>
          <TvExitModal
            onKeepPlaying={() => setShowExitModal(false)}
            onReload={reloadApp}
            onExit={() => exitTizenApp('/')}
          />
        </Show>
      </div>
    </div>
  );
}
