import { For, Show, createEffect } from 'solid-js';
import type { WikiRaceHostView, WikiRacePlayerView } from '../../../../shared/games/wikirace';
import type { GameUiDefinition, MobileGameViewProps, TvGameViewProps } from '../registry';
import './wikirace.css';

function WikiRaceTvView(props: TvGameViewProps<WikiRaceHostView>) {
  const host = () => props.state.hostState;

  return (
    <div class="tv-phase-center">
      <p class="eyebrow">WIKIPEDIA RACE · ROUND {host()?.round ?? 1}</p>

      <div class="wr-tv-route">
        <span class="wr-tv-article">{host()?.startTitle}</span>
        <span class="wr-tv-arrow">→</span>
        <span class="wr-tv-article wr-tv-target">{host()?.targetTitle}</span>
      </div>

      <Show when={host()?.error}>
        <p class="wr-error-banner">{host()?.error}</p>
      </Show>

      <Show
        when={host()?.phase !== 'LOADING'}
        fallback={
          <Show when={!host()?.error}>
            <div class="spinner" />
            <p class="tv-hero-sub">Loading Wikipedia articles…</p>
          </Show>
        }
      >
        <Show when={host()?.phase === 'RESULTS' && host()?.loserName}>
          <p class="wr-tv-loser">{host()?.loserName} was last to arrive. DRINKS!</p>
        </Show>

        <div class="wr-tv-board">
          <For each={host()?.players ?? []}>
            {(player) => {
              const isLoser = () =>
                host()?.phase === 'RESULTS' && host()?.loserId === player.playerId;
              const isFinished = () => player.finishedRank !== null;
              const statusLabel = () => {
                if (isLoser()) return 'DRINKS';
                if (player.finishedRank !== null) return `#${player.finishedRank}`;
                if (!player.connected) return 'OFFLINE';
                return 'RACING';
              };

              return (
                <div
                  class={`wr-tv-row ${isLoser() ? 'is-loser' : ''} ${isFinished() ? 'is-finished' : ''}`}
                >
                  <span class="wr-tv-name">{player.name}</span>
                  <span class="wr-tv-hops">{player.hops} hops</span>
                  <span class="wr-tv-status">{statusLabel()}</span>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      <div class="tv-action-bar wr-tv-actions">
        <Show when={host()?.phase === 'RESULTS' || host()?.error}>
          <button class="btn btn-tv" onClick={() => props.sendAction({ type: 'next_race' })}>
            Next Race
          </button>
        </Show>
        <button class="btn btn-tv" onClick={props.endGame}>
          End Game
        </button>
      </div>
    </div>
  );
}

function WikiRaceMobileView(props: MobileGameViewProps<WikiRacePlayerView>) {
  const view = () => props.state.playerState;

  createEffect(
    () => ({ html: view()?.articleHtml, title: view()?.currentTitle }),
    (deps) => {
      if (!deps.html || !deps.title) return;
      requestAnimationFrame(() => window.scrollTo(0, 0));
    }
  );

  const handleArticleClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest('a[data-wiki-title]');
    if (!anchor) return;

    e.preventDefault();
    if (view()?.loading) return;

    const title = anchor.getAttribute('data-wiki-title');
    if (title) {
      props.sendAction({ type: 'navigate', payload: { title } });
    }
  };

  return (
    <div class="wr-mobile-wrap">
      <div class="wr-mobile-bar">
        <Show when={view()?.canGoBack} fallback={<span class="wr-bar-hops">Start: {view()?.startTitle}</span>}>
          <button
            class="btn wr-back-btn"
            disabled={view()?.loading}
            onClick={() => props.sendAction({ type: 'back' })}
          >
            ← Back
          </button>
        </Show>

        <div class="wr-bar-target">
          Target: <span>{view()?.targetTitle}</span>
        </div>

        <span class="wr-bar-hops">{view()?.hops ?? 0} hops</span>
      </div>

      <Show when={view()?.error}>
        <div class="wr-error-banner">{view()?.error}</div>
      </Show>

      <Show when={view()?.phase === 'LOADING'}>
        <div class="wr-status-card">
          <Show
            when={!view()?.error}
            fallback={
              <button class="btn" onClick={() => props.sendAction({ type: 'next_race' })}>
                Try Another Pair
              </button>
            }
          >
            <div class="spinner" />
            <p class="wr-status-title">Loading {view()?.startTitle}…</p>
          </Show>
        </div>
      </Show>

      <Show when={view()?.phase === 'RESULTS'}>
        <div class={`wr-status-card ${view()?.isLoser ? 'is-loser' : ''}`}>
          <Show
            when={view()?.isLoser}
            fallback={
              <p class="wr-status-title">
                {view()?.finishedRank !== null
                  ? `Finished #${view()?.finishedRank} in ${view()?.hops} hops!`
                  : 'Race Complete'}
              </p>
            }
          >
            <p class="wr-status-title">LAST TO ARRIVE. DRINK!</p>
          </Show>

          <Show when={view()?.loserName && !view()?.isLoser}>
            <p>{view()?.loserName} was last to arrive and drinks!</p>
          </Show>

          <div class="wr-mobile-board">
            <For each={view()?.players ?? []}>
              {(p) => (
                <div class="wr-mobile-row">
                  <span>{p.name}</span>
                  <span>
                    {p.finishedRank !== null ? `#${p.finishedRank} · ` : ''}
                    {p.hops} hops
                  </span>
                </div>
              )}
            </For>
          </div>

          <button class="btn" onClick={() => props.sendAction({ type: 'next_race' })}>
            Next Race
          </button>
        </div>
      </Show>

      <Show when={view()?.phase === 'RACING' && view()?.finishedRank !== null}>
        <div class="wr-status-card">
          <p class="wr-status-title">
            Arrived #{view()?.finishedRank} in {view()?.hops} hops!
          </p>
          <p>Waiting for the last player to arrive…</p>
        </div>
      </Show>

      <Show when={view()?.phase === 'RACING' && view()?.finishedRank === null}>
        <div class="wr-article-header">
          <h1 class="wr-article-title">{view()?.currentTitle}</h1>
          <Show when={view()?.loading}>
            <span class="wr-loading-pill">Loading…</span>
          </Show>
        </div>

        <div
          class={`wr-article-body ${view()?.loading ? 'is-loading' : ''}`}
          innerHTML={view()?.articleHtml ?? ''}
          onClick={handleArticleClick}
        />
      </Show>
    </div>
  );
}

export const wikiraceGameUi: GameUiDefinition<WikiRaceHostView, WikiRacePlayerView> = {
  id: 'wikirace',
  name: 'Wikipedia Race',
  TvView: WikiRaceTvView,
  MobileView: WikiRaceMobileView,
};
