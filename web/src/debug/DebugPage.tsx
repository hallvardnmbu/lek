import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';
import { MobileStage } from '../components/mobile/MobileStage';
import { TvStage } from '../components/tv/TvStage';
import { createGameSocket } from '../lib/ws';
import './debug.css';

interface VirtualPlayer {
  key: number;
  name: string;
}

interface DebugPhoneProps {
  roomCode: string;
  name: string;
  leaving: boolean;
  onRemove: () => void;
}

function DebugPhone(props: DebugPhoneProps) {
  const [playerId, setPlayerId] = createSignal<string | null>(null);

  const socket = createGameSocket({
    onOpen(send) {
      send({
        type: 'join_room',
        payload: {
          code: props.roomCode,
          name: props.name,
          playerId: playerId() ?? undefined,
        },
      });
    },
    onMessage(msg) {
      if (msg.type === 'joined') {
        setPlayerId(msg.payload.playerId);
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

  const handleLeave = () => {
    const s = state();
    const id = playerId();
    if (s && id) {
      socket.send({ type: 'leave_room', payload: { code: s.code, playerId: id } });
    }
    props.onRemove();
  };

  createEffect(
    () => props.leaving,
    (leaving) => {
      if (leaving) handleLeave();
    }
  );

  return (
    <div class="debug-phone">
      <div class="debug-phone-head">
        <span class={`debug-dot ${socket.connected() ? 'on' : ''}`} />
        <span>{props.name}</span>
        <Show when={me()}>
          {(p) => <span class="muted">· {p().score} pts</span>}
        </Show>
        <span class="debug-spacer" />
        <button class="debug-btn" onClick={handleLeave}>
          ×
        </button>
      </div>

      <Show when={socket.error()}>
        <div class="debug-error">{socket.error()}</div>
      </Show>

      <div class="debug-phone-body">
        <Show when={state() && playerId()} fallback={<p class="muted">Joining...</p>}>
          <Show when={state()}>
            {(s) => (
              <MobileStage
                state={s()}
                playerId={playerId()!}
                me={me()}
                remainingMs={socket.remainingMs()}
                lastEvent={socket.lastEvent()}
                send={socket.send}
                sendAction={(action) =>
                  socket.sendAction(action, { playerId: playerId()! })
                }
                onLeave={handleLeave}
              />
            )}
          </Show>
        </Show>
      </div>
    </div>
  );
}

export function DebugPage() {
  const params = new URLSearchParams(window.location.search);
  const initialPlayers = Math.max(1, Math.min(8, Number(params.get('players') ?? 2) || 2));
  const initialGame = params.get('game');

  const [hostToken, setHostToken] = createSignal<string | undefined>(undefined);
  const [selectedGameId, setSelectedGameId] = createSignal<string>(initialGame ?? '');
  const [pendingLaunchGame, setPendingLaunchGame] = createSignal<string | null>(initialGame);
  const [showInspector, setShowInspector] = createSignal(false);

  let nextKey = 1;
  const makePlayer = (): VirtualPlayer => {
    const k = nextKey++;
    return { key: k, name: `P${k}` };
  };

  const [virtualPlayers, setVirtualPlayers] = createSignal<VirtualPlayer[]>(
    Array.from({ length: initialPlayers }, () => makePlayer())
  );

  const socket = createGameSocket({
    onOpen(send) {
      send({ type: 'create_room', payload: { hostToken: hostToken() } });
    },
    onMessage(msg) {
      if (msg.type === 'room_created') {
        setHostToken(msg.payload.hostToken);
      }
    },
  });

  const state = () => socket.roomState();

  const secondsLeft = createMemo(() => {
    const ms = socket.remainingMs();
    return ms === null ? null : Math.ceil(ms / 1000);
  });

  const selectedGame = createMemo(() => {
    const s = state();
    if (!s) return null;
    return s.games.find((g) => g.id === selectedGameId()) ?? s.games[0] ?? null;
  });

  createEffect(
    () => state(),
    (s) => {
      if (!s) return;
      if (!selectedGameId() && s.games.length > 0) {
        setSelectedGameId(s.games[0].id);
      }
    }
  );

  createEffect(
    () => ({ s: state(), targetGame: pendingLaunchGame() }),
    ({ s, targetGame }) => {
      if (!s || !targetGame) return;

      const game = s.games.find((g) => g.id === targetGame);
      if (!game) {
        setPendingLaunchGame(null);
        return;
      }

      if (s.players.length < game.minPlayers) return;

      if (s.phase === 'LOBBY' || s.phase === 'GAME_SELECT') {
        setPendingLaunchGame(null);
        socket.send({
          type: 'start_game',
          payload: { code: s.code, hostToken: hostToken(), gameId: targetGame },
        });
      } else if (s.phase === 'PLAYING' || s.phase === 'ENDED') {
        socket.send({
          type: 'return_to_lobby',
          payload: { code: s.code, hostToken: hostToken() },
        });
      }
    }
  );

  const handleLaunchGame = () => {
    const game = selectedGame();
    if (!game) return;
    setPendingLaunchGame(game.id);
  };

  const addPlayer = () => {
    setVirtualPlayers((prev) => [...prev, makePlayer()]);
  };

  const [leavingKey, setLeavingKey] = createSignal<number | null>(null);

  const removePlayer = (key: number) => {
    setVirtualPlayers((prev) => prev.filter((p) => p.key !== key));
  };

  const navigateHome = () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div class="debug-shell">
      <div class="debug-bar">
        <span class="debug-badge">DEBUG</span>

        <Show when={state()}>
          {(s) => (
            <>
              <span class="debug-badge">
                {s().code} · {s().phase}
              </span>

              <Show when={secondsLeft() !== null}>
                <span class="debug-badge">{secondsLeft()}s</span>
              </Show>

              <div class="debug-group">
                <select
                  class="debug-select"
                  value={selectedGame()?.id ?? ''}
                  onChange={(e) => setSelectedGameId(e.currentTarget.value)}
                >
                  <For each={s().games}>
                    {(g) => (
                      <option value={g.id}>
                        {g.name} ({g.minPlayers}-{g.maxPlayers}p)
                      </option>
                    )}
                  </For>
                </select>
                <button
                  class="debug-btn debug-btn-primary"
                  disabled={!selectedGame() || s().players.length < (selectedGame()?.minPlayers ?? 1)}
                  onClick={handleLaunchGame}
                >
                  Launch
                </button>
              </div>

              <div class="debug-group">
                <button
                  class="debug-btn"
                  disabled={s().phase === 'PLAYING'}
                  onClick={() =>
                    socket.send({
                      type: 'open_game_selector',
                      payload: { code: s().code, hostToken: hostToken() },
                    })
                  }
                >
                  Selector
                </button>
                <button
                  class="debug-btn"
                  disabled={s().phase !== 'PLAYING'}
                  onClick={() =>
                    socket.send({
                      type: 'end_game',
                      payload: { code: s().code, hostToken: hostToken() },
                    })
                  }
                >
                  End
                </button>
                <button
                  class="debug-btn"
                  disabled={s().phase === 'LOBBY'}
                  onClick={() =>
                    socket.send({
                      type: 'return_to_lobby',
                      payload: { code: s().code, hostToken: hostToken() },
                    })
                  }
                >
                  Lobby
                </button>
              </div>

              <div class="debug-group">
                <button
                  class="debug-btn"
                  disabled={virtualPlayers().length >= s().maxPlayers}
                  onClick={addPlayer}
                >
                  + Player
                </button>
                <button
                  class="debug-btn"
                  disabled={virtualPlayers().length === 0}
                  onClick={() => {
                    const list = virtualPlayers();
                    if (list.length > 0) setLeavingKey(list[list.length - 1].key);
                  }}
                >
                  - Player
                </button>
              </div>
            </>
          )}
        </Show>

        <span class="debug-spacer" />

        <button class="debug-btn" onClick={() => setShowInspector((v) => !v)}>
          {showInspector() ? 'Hide JSON' : 'State JSON'}
        </button>
        <button class="debug-btn" onClick={navigateHome}>
          Exit
        </button>
      </div>

      <Show when={socket.error()}>
        <div class="debug-error">{socket.error()}</div>
      </Show>

      <Show when={state()} fallback={<p class="muted" style={{ padding: '1rem' }}>Connecting...</p>}>
        {(s) => (
          <>
            <div class="debug-workspace">
              <section class="debug-tv-panel">
                <div class="debug-panel-label">
                  <span>TV Host</span>
                  <span>v{s().stateVersion}</span>
                </div>
                <div class="debug-tv-stage">
                  <TvStage
                    state={s()}
                    hostToken={hostToken()}
                    remainingMs={socket.remainingMs()}
                    lastEvent={socket.lastEvent()}
                    muted
                    onToggleSound={() => {}}
                    send={socket.send}
                    sendAction={(action) =>
                      socket.sendAction(action, { hostToken: hostToken() })
                    }
                  />
                </div>
              </section>

              <section class="debug-phones-grid">
                <For each={virtualPlayers()}>
                  {(vp) => (
                    <DebugPhone
                      roomCode={s().code}
                      name={vp.name}
                      leaving={leavingKey() === vp.key}
                      onRemove={() => removePlayer(vp.key)}
                    />
                  )}
                </For>
              </section>
            </div>

            <Show when={showInspector()}>
              <div class="debug-inspector">
                <div class="debug-panel-label">
                  <span>Host RoomState</span>
                  <span>roundId: {s().roundId}</span>
                </div>
                <pre>{JSON.stringify(s(), null, 2)}</pre>
              </div>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}
