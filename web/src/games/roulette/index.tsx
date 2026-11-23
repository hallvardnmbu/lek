import { For, Show } from 'solid-js';
import type { RouletteHostView, RoulettePlayerView } from '../../../../shared/games/roulette';
import type { GameUiDefinition, MobileGameViewProps, TvGameViewProps } from '../registry';
import './roulette.css';

function RouletteTvView(props: TvGameViewProps<RouletteHostView>) {
  const host = () => props.state.hostState;

  return (
    <div class="tv-phase-center">
      <p class="eyebrow">ROULETTE</p>
      <Show
        when={host()?.phase === 'STOPPED'}
        fallback={<h1 class="tv-hero-title">Spinning</h1>}
      >
        <h1 class="roulette-tv-winner">{host()?.selectedName ?? 'Stopped'}</h1>
      </Show>

      <div class="roulette-tv-grid">
        <For each={host()?.players ?? []}>
          {(player) => (
            <div
              class={`roulette-tv-chip ${player.isActive ? 'is-active' : ''} ${player.isSelected ? 'is-selected' : ''}`}
            >
              {player.name}
            </div>
          )}
        </For>
      </div>

      <div class="tv-action-bar roulette-tv-actions">
        <Show when={host()?.phase === 'STOPPED'}>
          <button class="btn btn-tv" onClick={() => props.sendAction({ type: 'spin' })}>
            Spin Again
          </button>
        </Show>
        <button class="btn btn-tv" onClick={() => props.endGame()}>
          End Game
        </button>
      </div>
    </div>
  );
}

function RouletteMobileView(props: MobileGameViewProps<RoulettePlayerView>) {
  const view = () => props.state.playerState;

  const screenClass = () => {
    const v = view();
    const variant =
      v?.phase === 'SPINNING'
        ? v.isActive
          ? 'white'
          : 'idle'
        : v?.isSelected
          ? 'red'
          : 'idle';
    return `roulette-screen roulette-screen-${variant}`;
  };

  return (
    <div class={screenClass()}>
      <Show when={view()?.phase === 'SPINNING' && !view()?.isActive}>
        <p class="roulette-screen-sub">Watch phones</p>
      </Show>

      <Show when={view()?.phase === 'STOPPED'}>
        <Show
          when={view()?.isSelected}
          fallback={
            <>
              <p class="roulette-screen-label">{view()?.selectedName ?? 'Stopped'}</p>
              <p class="roulette-screen-sub">You are safe</p>
            </>
          }
        >
          <p class="roulette-screen-label">YOU!</p>
        </Show>

        <button
          class="btn roulette-spin-again"
          onClick={() => props.sendAction({ type: 'spin' })}
        >
          Spin Again
        </button>
      </Show>
    </div>
  );
}

export const rouletteGameUi: GameUiDefinition<RouletteHostView, RoulettePlayerView> = {
  id: 'roulette',
  name: 'Roulette',
  TvView: RouletteTvView,
  MobileView: RouletteMobileView,
};
