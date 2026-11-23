import { Show, createMemo, dynamicComponent } from 'solid-js';
import type { ClientMessage, GameAction, PlayerSummary, RoomState } from '../../../../shared/protocol';
import { getGameUi } from '../../games';
import { MobileEnded } from './MobileEnded';
import { MobileGameFallback } from './MobileGameFallback';
import { MobileGameSelector } from './MobileGameSelector';
import { MobileLobby } from './MobileLobby';

interface MobileStageProps {
  state: RoomState;
  playerId: string;
  me: PlayerSummary | null;
  remainingMs: number | null;
  lastEvent: { event: string; payload: unknown; at: number } | null;
  send: (msg: ClientMessage) => void;
  sendAction: (action: GameAction) => void;
  onLeave: () => void;
}

export function MobileStage(props: MobileStageProps) {
  const activeGameUi = createMemo(() => getGameUi(props.state.gameId));
  const ActiveMobileView = dynamicComponent(() => activeGameUi()?.MobileView);
  const activeGameInfo = createMemo(() => {
    const id = props.state.gameId;
    return id ? (props.state.games.find((g) => g.id === id) ?? null) : null;
  });

  return (
    <>
      <Show when={props.state.phase === 'LOBBY'}>
        <MobileLobby state={props.state} me={props.me} onLeave={props.onLeave} />
      </Show>

      <Show when={props.state.phase === 'GAME_SELECT'}>
        <MobileGameSelector
          state={props.state}
          playerId={props.playerId}
          onVoteGame={(gameId) =>
            props.send({
              type: 'vote_game',
              payload: { code: props.state.code, playerId: props.playerId, gameId },
            })
          }
        />
      </Show>

      <Show when={props.state.phase === 'PLAYING'}>
        <Show
          when={activeGameUi()}
          fallback={
            <MobileGameFallback gameInfo={activeGameInfo()} onSendAction={props.sendAction} />
          }
        >
          <ActiveMobileView
            state={props.state}
            playerId={props.playerId}
            remainingMs={props.remainingMs}
            lastEvent={props.lastEvent}
            sendAction={props.sendAction}
          />
        </Show>
      </Show>

      <Show when={props.state.phase === 'ENDED'}>
        <MobileEnded
          score={props.me?.score ?? 0}
          totalScore={props.me?.totalScore ?? 0}
          randomizedMode={props.state.randomizedMode}
        />
      </Show>
    </>
  );
}
