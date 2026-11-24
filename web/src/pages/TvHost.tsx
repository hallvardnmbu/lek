import { Show, createEffect, createMemo, createSignal, onSettled } from 'solid-js';
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
  let seenRoomCode: string | null = null;
  let seenPlayerIds = new Set<string>();

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

  createEffect(
    () => {
      const s = state();
      return s
        ? { code: s.code, phase: s.phase, ids: s.players.map((p) => p.id) }
        : null;
    },
    (snap) => {
      if (!snap) return;
      if (seenRoomCode !== snap.code) {
        seenRoomCode = snap.code;
        seenPlayerIds = new Set(snap.ids);
        return;
      }
      const hasNewJoin = snap.ids.some((id) => !seenPlayerIds.has(id));
      seenPlayerIds = new Set(snap.ids);
      if (hasNewJoin && snap.phase === 'LOBBY') {
        lobbyMusic.playJoinPling();
      }
    }
  );

  const abortGame = () => {
    const s = state();
    if (!s) return;
    socket.send({
      type: 'abort_game',
      payload: { code: s.code, hostToken: hostToken() },
    });
  };

  return (
    <div class="tv-viewport">
      <div
        class={`tv-canvas ${state()?.phase === 'LOBBY' ? 'tv-canvas-lobby' : ''}`}
        ref={(el) => (canvasRef = el)}
      >
        <header class="tv-header">
          <div class="tv-brand">
            <span class="brand">Party</span>
            <Show when={!socket.connected()}>
              <span class="conn-pill">Reconnecting</span>
            </Show>
          </div>

          <Show when={state()}>
            {(s) => (
              <div class="tv-room-strip">
                <Show when={s().phase === 'PLAYING'}>
                  <button class="btn" onClick={abortGame}>
                    Abort
                  </button>
                </Show>
                <button class="btn" onClick={lobbyMusic.toggleMute}>
                  {lobbyMusic.muted() ? 'Sound on' : 'Sound off'}
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
              <p>Creating room</p>
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
            canAbort={state()?.phase === 'PLAYING'}
            onAbort={() => {
              abortGame();
              setShowExitModal(false);
            }}
            onKeepPlaying={() => setShowExitModal(false)}
            onReload={reloadApp}
            onExit={() => exitTizenApp('/')}
          />
        </Show>
      </div>
    </div>
  );
}
