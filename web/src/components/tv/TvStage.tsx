import { Show, createMemo, dynamicComponent } from 'solid-js';
import type { ClientMessage, GameAction, GameSelectMode, RoomState } from '../../../../shared/protocol';
import { getGameUi } from '../../games';
import { TvEnded } from './TvEnded';
import { TvGameFallback } from './TvGameFallback';
import { TvGameSelector } from './TvGameSelector';
import { TvLobby } from './TvLobby';

interface TvStageProps {
  state: RoomState;
  hostToken?: string;
  remainingMs: number | null;
  lastEvent: { event: string; payload: unknown; at: number } | null;
  muted: boolean;
  onToggleSound: () => void;
  send: (msg: ClientMessage) => void;
  sendAction: (action: GameAction) => void;
}

export function TvStage(props: TvStageProps) {
  const activeGameUi = createMemo(() => getGameUi(props.state.gameId));
  const ActiveTvView = dynamicComponent(() => activeGameUi()?.TvView);
  const activeGameInfo = createMemo(() => {
    const id = props.state.gameId;
    return id ? (props.state.games.find((g) => g.id === id) ?? null) : null;
  });

  const sendHost = (
    type:
      | 'open_game_selector'
      | 'start_random_game'
      | 'stop_randomized'
      | 'end_game'
      | 'return_to_lobby'
  ) => {
    props.send({ type, payload: { code: props.state.code, hostToken: props.hostToken } });
  };

  return (
    <>
      <Show when={props.state.phase === 'LOBBY'}>
        <TvLobby
          state={props.state}
          joinUrl={`${window.location.origin}/play/${props.state.code}`}
          canEnterSelector={props.state.players.length >= props.state.minPlayers}
          muted={props.muted}
          onToggleSound={props.onToggleSound}
          onOpenSelector={() => sendHost('open_game_selector')}
        />
      </Show>

      <Show when={props.state.phase === 'GAME_SELECT'}>
        <TvGameSelector
          state={props.state}
          onSelectMode={(mode: GameSelectMode) =>
            props.send({
              type: 'set_game_select_mode',
              payload: { code: props.state.code, hostToken: props.hostToken, mode },
            })
          }
          onStartRandomGame={() => sendHost('start_random_game')}
          onStartGame={(gameId: string) =>
            props.send({
              type: 'start_game',
              payload: { code: props.state.code, hostToken: props.hostToken, gameId },
            })
          }
          onReturnToLobby={() => sendHost('return_to_lobby')}
        />
      </Show>

      <Show when={props.state.phase === 'PLAYING'}>
        <Show
          when={activeGameUi()}
          fallback={
            <TvGameFallback
              state={props.state}
              gameInfo={activeGameInfo()}
              lastEvent={props.lastEvent}
              onEndGame={() => sendHost('end_game')}
            />
          }
        >
          <ActiveTvView
            state={props.state}
            remainingMs={props.remainingMs}
            lastEvent={props.lastEvent}
            sendAction={props.sendAction}
            endGame={() => sendHost('end_game')}
          />
        </Show>
      </Show>

      <Show when={props.state.phase === 'ENDED'}>
        <TvEnded
          state={props.state}
          onNextRandomGame={() => sendHost('start_random_game')}
          onStopRandomized={() => sendHost('stop_randomized')}
          onChooseAnotherGame={() => sendHost('open_game_selector')}
          onReturnToLobby={() => sendHost('return_to_lobby')}
        />
      </Show>
    </>
  );
}
