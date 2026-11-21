import { Show, createMemo, createSignal, dynamicComponent, onSettled } from 'solid-js';
import { MobileEnded } from '../components/mobile/MobileEnded';
import { MobileGameFallback } from '../components/mobile/MobileGameFallback';
import { MobileGameSelector } from '../components/mobile/MobileGameSelector';
import { MobileJoinForm } from '../components/mobile/MobileJoinForm';
import { MobileLobby } from '../components/mobile/MobileLobby';
import { getGameUi } from '../games';
import {
  clearPlayerSession,
  createGameSocket,
  loadPlayerSession,
  savePlayerSession,
} from '../lib/ws';

interface MobilePlayProps {
  initialCode?: string;
}

export function MobilePlay(props: MobilePlayProps) {
  onSettled(() => {
    const preventGesture = (e: Event) => e.preventDefault();
    const preventPinch = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };

    document.addEventListener('gesturestart', preventGesture, { passive: false });
    document.addEventListener('gesturechange', preventGesture, { passive: false });
    document.addEventListener('gestureend', preventGesture, { passive: false });
    document.addEventListener('touchmove', preventPinch, { passive: false });

    return () => {
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
      document.removeEventListener('touchmove', preventPinch);
    };
  });

  const existing = loadPlayerSession();
  const [codeInput, setCodeInput] = createSignal(() =>
    (props.initialCode || existing?.code || '').toUpperCase()
  );
  const [nameInput, setNameInput] = createSignal(existing?.name || '');
  const [playerId, setPlayerId] = createSignal<string | null>(existing?.playerId ?? null);
  const [joinedCode, setJoinedCode] = createSignal<string | null>(null);

  const socket = createGameSocket({
    onOpen(send) {
      const saved = loadPlayerSession();
      if (saved && (!props.initialCode || props.initialCode.toUpperCase() === saved.code)) {
        send({
          type: 'reconnect',
          payload: { code: saved.code, playerId: saved.playerId },
        });
      }
    },
    onMessage(msg) {
      if (msg.type === 'joined') {
        setPlayerId(msg.payload.playerId);
        setJoinedCode(msg.payload.code);
        savePlayerSession({
          code: msg.payload.code,
          playerId: msg.payload.playerId,
          name: msg.payload.name,
        });
      } else if (msg.type === 'left') {
        clearPlayerSession();
        setJoinedCode(null);
        setPlayerId(null);
      } else if (msg.type === 'error') {
        if (
          msg.payload.code === 'ROOM_NOT_FOUND' ||
          msg.payload.code === 'PLAYER_NOT_FOUND'
        ) {
          clearPlayerSession();
          setJoinedCode(null);
          setPlayerId(null);
        }
      }
    },
  });

  const state = () => socket.roomState();

  const me = createMemo(() => {
    const s = state();
    const id = playerId();
    if (!s || !id) return null;
    return s.players.find((p) => p.id === id) ?? null;
  });

  const secondsLeft = createMemo(() => {
    const ms = socket.remainingMs();
    return ms === null ? null : Math.ceil(ms / 1000);
  });

  const activeGameUi = createMemo(() => getGameUi(state()?.gameId));
  const ActiveMobileView = dynamicComponent(() => activeGameUi()?.MobileView);
  const activeGameInfo = createMemo(() => {
    const s = state();
    if (!s || !s.gameId) return null;
    return s.games.find((g) => g.id === s.gameId) ?? null;
  });

  const handleJoin = (e: Event) => {
    e.preventDefault();
    socket.setError(null);
    socket.send({
      type: 'join_room',
      payload: {
        code: codeInput().trim().toUpperCase(),
        name: nameInput().trim(),
        playerId: playerId() ?? undefined,
      },
    });
  };

  const handleOpenSelector = () => {
    const s = state();
    const id = playerId();
    if (!s || !id) return;
    socket.send({
      type: 'open_game_selector',
      payload: { code: s.code, playerId: id },
    });
  };

  const handleStartGame = (gameId: string) => {
    const s = state();
    const id = playerId();
    if (!s || !id) return;
    socket.send({
      type: 'start_game',
      payload: { code: s.code, playerId: id, gameId },
    });
  };

  const handleReturnToLobby = () => {
    const s = state();
    const id = playerId();
    if (!s || !id) return;
    socket.send({
      type: 'return_to_lobby',
      payload: { code: s.code, playerId: id },
    });
  };

  const handleLeave = () => {
    const s = state();
    const id = playerId();
    if (s && id) {
      socket.send({
        type: 'leave_room',
        payload: { code: s.code, playerId: id },
      });
    }
    clearPlayerSession();
    setJoinedCode(null);
    setPlayerId(null);
  };

  return (
    <main class="mobile-shell">
      <header class="mobile-header">
        <span class="mobile-brand">Party</span>
        <Show when={joinedCode() && me()}>
          <div class="mobile-player-pill">
            <span>{me()!.name}</span>
            <strong>{me()!.score} pts</strong>
          </div>
        </Show>
      </header>

      <Show when={socket.error()}>
        <div class="mobile-error">{socket.error()}</div>
      </Show>

      <Show
        when={Boolean(joinedCode()) && state()}
        fallback={
          <MobileJoinForm
            codeInput={codeInput()}
            nameInput={nameInput()}
            connected={socket.connected()}
            onCodeInput={setCodeInput}
            onNameInput={setNameInput}
            onSubmit={handleJoin}
          />
        }
      >
        {(s) => (
          <div class="mobile-stage">
            <Show when={secondsLeft() !== null}>
              <div class="mobile-timer">Time left: {secondsLeft()}s</div>
            </Show>

            <Show when={s().phase === 'LOBBY'}>
              <MobileLobby
                state={s()}
                isVip={Boolean(me()?.isVip)}
                onOpenSelector={handleOpenSelector}
                onLeave={handleLeave}
              />
            </Show>

            <Show when={s().phase === 'GAME_SELECT'}>
              <MobileGameSelector
                state={s()}
                isVip={Boolean(me()?.isVip)}
                onStartGame={handleStartGame}
                onReturnToLobby={handleReturnToLobby}
              />
            </Show>

            <Show when={s().phase === 'PLAYING'}>
              <Show
                when={Boolean(playerId()) && activeGameUi()}
                fallback={
                  <MobileGameFallback
                    gameInfo={activeGameInfo()}
                    onSendAction={(action) =>
                      socket.sendAction(action, { playerId: playerId() ?? undefined })
                    }
                  />
                }
              >
                <ActiveMobileView
                  state={s()}
                  playerId={playerId()!}
                  remainingMs={socket.remainingMs()}
                  lastEvent={socket.lastEvent()}
                  sendAction={(action) =>
                    socket.sendAction(action, { playerId: playerId() ?? undefined })
                  }
                />
              </Show>
            </Show>

            <Show when={s().phase === 'ENDED'}>
              <MobileEnded
                score={me()?.score ?? 0}
                isVip={Boolean(me()?.isVip)}
                onOpenSelector={handleOpenSelector}
                onReturnToLobby={handleReturnToLobby}
              />
            </Show>
          </div>
        )}
      </Show>
    </main>
  );
}
