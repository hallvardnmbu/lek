import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import {
  buildStepOffsetsMs,
  type RouletteHostView,
  type RoulettePlayerView,
  type RouletteSpinSchedule,
} from '../../../../shared/games/roulette';
import type { GameUiDefinition, MobileGameViewProps, TvGameViewProps } from '../registry';
import './roulette.css';

function createActivePlayerId(getSpin: () => RouletteSpinSchedule | null): () => string | null {
  const [activeId, setActiveId] = createSignal<string | null>(null);

  createEffect(getSpin, (spin) => {
    if (!spin || spin.playerOrder.length === 0 || spin.totalSteps <= 0) {
      setActiveId(null);
      return;
    }

    const offsets = buildStepOffsetsMs(spin.totalSteps);
    const localStartAt = Date.now() + (spin.spinStartAt - spin.serverNow);
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const elapsed = Date.now() - localStartAt;
      if (elapsed < 0) {
        setActiveId(null);
        timer = setTimeout(tick, Math.max(1, -elapsed));
        return;
      }

      let step = 0;
      while (step + 1 < offsets.length && offsets[step + 1] <= elapsed) {
        step++;
      }

      const idx = (spin.startIndex + step) % spin.playerOrder.length;
      setActiveId(spin.playerOrder[idx] ?? null);

      if (step + 1 < offsets.length) {
        const nextDelay = localStartAt + offsets[step + 1] - Date.now();
        timer = setTimeout(tick, Math.max(1, nextDelay));
      }
    };

    tick();
    onCleanup(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
  });

  return activeId;
}

function RouletteTvView(props: TvGameViewProps<RouletteHostView>) {
  const host = () => props.state.hostState;
  const activeId = createActivePlayerId(() => host()?.spin ?? null);

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
              class={`roulette-tv-chip ${host()?.phase === 'SPINNING' && activeId() === player.id ? 'is-active' : ''} ${player.isSelected ? 'is-selected' : ''}`}
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
  const activeId = createActivePlayerId(() => view()?.spin ?? null);
  const isActive = () => {
    const v = view();
    return v?.phase === 'SPINNING' && activeId() === v.playerId;
  };

  const screenClass = () => {
    const v = view();
    const variant =
      v?.phase === 'SPINNING'
        ? isActive()
          ? 'white'
          : 'idle'
        : v?.isSelected
          ? 'red'
          : 'idle';
    return `roulette-screen roulette-screen-${variant}`;
  };

  return (
    <div class={screenClass()}>
      <Show when={view()?.phase === 'SPINNING' && !isActive()}>
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
