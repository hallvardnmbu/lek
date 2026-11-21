import { Show, createMemo, createSignal, onMount } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { TvEnded } from '../components/tv/TvEnded';
import { TvExitModal } from '../components/tv/TvExitModal';
import { TvGameFallback } from '../components/tv/TvGameFallback';
import { TvGameSelector } from '../components/tv/TvGameSelector';
import { TvLobby } from '../components/tv/TvLobby';
import { getGameUi } from '../games';
import { createLobbyMusic } from '../lib/audio';
import { createDpadNav } from '../lib/dpad';
import { exitTizenApp, initTizenTv } from '../lib/tizen';
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
  const joinUrl = createMemo(() => {
    const code = state()?.code;
    return code ? `${window.location.origin}/play/${code}` : window.location.origin;
  });

  const secondsLeft = createMemo(() => {
    const ms = socket.remainingMs();
    return ms === null ? null : Math.ceil(ms / 1000);
  });

  const canEnterSelector = createMemo(() => {
    const s = state();
    return Boolean(s && s.phase === 'LOBBY' && s.players.length >= s.minPlayers);
  });

  const activeGameUi = createMemo(() => getGameUi(state()?.gameId));
  const activeGameInfo = createMemo(() => {
    const s = state();
    if (!s || !s.gameId) return null;
    return s.games.find((g) => g.id === s.gameId) ?? null;
  });

  const handleOpenSelector = () => {
    const s = state();
    if (!s || !canEnterSelector()) return;
    socket.send({
      type: 'open_game_selector',
      payload: { code: s.code, hostToken: hostToken() },
    });
  };

  const handleStartGame = (gameId: string) => {
    const s = state();
    if (!s) return;
    socket.send({
      type: 'start_game',
      payload: { code: s.code, hostToken: hostToken(), gameId },
    });
  };

  const handleEndGame = () => {
    const s = state();
    if (!s) return;
    socket.send({
      type: 'end_game',
      payload: { code: s.code, hostToken: hostToken() },
    });
  };

  const handleReturnToLobby = () => {
    const s = state();
    if (!s) return;
    socket.send({
      type: 'return_to_lobby',
      payload: { code: s.code, hostToken: hostToken() },
    });
  };

  const handleChooseAnotherGame = () => {
    const s = state();
    if (!s) return;
    socket.send({
      type: 'open_game_selector',
      payload: { code: s.code, hostToken: hostToken() },
    });
  };

  const handleReload = () => {
    window.location.reload();
  };

  onMount(() => {
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
      <div class="tv-canvas" ref={canvasRef}>
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
            <>
              <Show when={s().phase === 'LOBBY'}>
                <TvLobby
                  state={s()}
                  joinUrl={joinUrl()}
                  canEnterSelector={canEnterSelector()}
                  onOpenSelector={handleOpenSelector}
                />
              </Show>

              <Show when={s().phase === 'GAME_SELECT'}>
                <TvGameSelector
                  state={s()}
                  onStartGame={handleStartGame}
                  onReturnToLobby={handleReturnToLobby}
                />
              </Show>

              <Show when={s().phase === 'PLAYING'}>
                <Show
                  when={activeGameUi()}
                  fallback={
                    <TvGameFallback
                      state={s()}
                      gameInfo={activeGameInfo()}
                      lastEvent={socket.lastEvent()}
                      onEndGame={handleEndGame}
                    />
                  }
                >
                  {(ui) => (
                    <Dynamic
                      component={ui().TvView}
                      state={s()}
                      remainingMs={socket.remainingMs()}
                      lastEvent={socket.lastEvent()}
                      sendAction={(action) =>
                        socket.sendAction(action, { hostToken: hostToken() })
                      }
                      endGame={handleEndGame}
                    />
                  )}
                </Show>
              </Show>

              <Show when={s().phase === 'ENDED'}>
                <TvEnded
                  state={s()}
                  onChooseAnotherGame={handleChooseAnotherGame}
                  onReturnToLobby={handleReturnToLobby}
                />
              </Show>
            </>
          )}
        </Show>

        <Show when={showExitModal()}>
          <TvExitModal
            onKeepPlaying={() => setShowExitModal(false)}
            onReload={handleReload}
            onExit={() => exitTizenApp('/')}
          />
        </Show>
      </div>
    </div>
  );
}
