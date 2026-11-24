import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import {
  STEP_ANIM_MS,
  type WikiRaceHostView,
  type WikiRacePhase,
  type WikiRacePlayerProgress,
  type WikiRacePlayerView,
} from '../../../../shared/games/wikirace';
import { ResultList, type ResultListEntry } from '../../components/ResultList';
import type { GameUiDefinition, MobileGameViewProps, TvGameViewProps } from '../registry';
import './wikirace.css';

function buildResultEntries(
  players: WikiRacePlayerProgress[],
  phase: WikiRacePhase | undefined
): ResultListEntry[] {
  return players.map((player) => {
    if (player.finishedRank === 1) {
      return {
        playerId: player.playerId,
        name: player.name,
        detail: `${player.hops} hops`,
        badge: 'WINNER',
        badgeTone: 'accent',
        tone: 'accent',
        dimmed: !player.connected,
      };
    }

    return {
      playerId: player.playerId,
      name: player.name,
      detail: `${player.hops} hops`,
      badge: player.connected ? (phase === 'RACING' ? 'RACING' : 'DNF') : 'OFFLINE',
      badgeTone: 'muted',
      tone: 'default',
      dimmed: !player.connected,
    };
  });
}

function WikiRaceTvView(props: TvGameViewProps<WikiRaceHostView>) {
  const host = () => props.state.hostState;
  const [visibleSteps, setVisibleSteps] = createSignal(1);

  createEffect(
    () => ({
      phase: host()?.phase,
      total: host()?.winnerPath.length ?? 0,
    }),
    (info) => {
      if (info.phase !== 'RESULTS' || info.total === 0) {
        setVisibleSteps(1);
        return;
      }

      setVisibleSteps(1);
      if (info.total <= 1) return;

      const timer = setInterval(() => {
        setVisibleSteps((prev) => {
          const next = prev + 1;
          if (next >= info.total) {
            clearInterval(timer);
            return info.total;
          }
          return next;
        });
      }, STEP_ANIM_MS);

      onCleanup(() => clearInterval(timer));
    }
  );

  const revealedPath = createMemo(() => (host()?.winnerPath ?? []).slice(0, visibleSteps()));

  const winnerHops = createMemo(() => {
    const winnerId = host()?.winnerId;
    const found = host()?.players.find((p) => p.playerId === winnerId);
    if (found) return found.hops;
    return Math.max(0, (host()?.winnerPath.length ?? 1) - 1);
  });

  const entries = createMemo(() =>
    buildResultEntries(host()?.players ?? [], host()?.phase)
  );

  return (
    <div class="tv-phase-center wr-tv-stage">
      <p class="eyebrow">WIKIPEDIA</p>

      <Show when={host()?.phase !== 'RESULTS'}>
        <div class="wr-tv-route">
          <span class="wr-tv-article">{host()?.startTitle}</span>
          <span class="wr-tv-arrow">→</span>
          <span class="wr-tv-article wr-tv-target">{host()?.targetTitle}</span>
        </div>
      </Show>

      <Show when={host()?.error}>
        <p class="wr-notice-banner">{host()?.error}</p>
      </Show>

      <Show
        when={host()?.phase !== 'LOADING'}
        fallback={
          <Show when={!host()?.error}>
            <div class="spinner" />
            <p class="tv-hero-sub">Loading articles</p>
          </Show>
        }
      >
        <Show when={host()?.phase === 'RESULTS'}>
          <h2 class="wr-tv-winner">
            {host()?.winnerName ?? 'Winner'} won in {winnerHops()} hops!
          </h2>

          <div class="wr-path-chain">
            <For each={revealedPath()}>
              {(step, idx) => (
                <>
                  <Show when={idx() > 0}>
                    <span class="wr-path-arrow">→</span>
                  </Show>
                  <span
                    class={`wr-path-step ${idx() === revealedPath().length - 1 ? 'is-active' : ''}`}
                  >
                    {step}
                  </span>
                </>
              )}
            </For>
          </div>
        </Show>

        <ResultList
          class="wr-tv-results"
          players={props.state.players}
          entries={entries()}
        />
      </Show>
    </div>
  );
}

function WikiRaceMobileView(props: MobileGameViewProps<WikiRacePlayerView>) {
  const view = () => props.state.playerState;
  let articleRef: HTMLDivElement | undefined;

  const scrollArticleToTop = () => {
    if (articleRef) {
      articleRef.scrollTop = 0;
    }
  };

  createEffect(
    () => view()?.currentTitle,
    (title) => {
      if (!title) return;
      scrollArticleToTop();
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
      scrollArticleToTop();
      props.sendAction({ type: 'navigate', payload: { title } });
    }
  };

  const handleBackClick = () => {
    if (view()?.loading) return;
    scrollArticleToTop();
    props.sendAction({ type: 'back' });
  };

  const winnerHops = createMemo(() => {
    const winnerId = view()?.winnerId;
    const found = view()?.players.find((p) => p.playerId === winnerId);
    if (found) return found.hops;
    return Math.max(0, (view()?.winnerPath.length ?? 1) - 1);
  });

  const entries = createMemo(() =>
    buildResultEntries(view()?.players ?? [], view()?.phase)
  );

  return (
    <div class="wr-mobile-wrap">
      <div class="wr-mobile-bar">
        <Show
          when={view()?.canGoBack}
          fallback={<span class="wr-bar-hops">Start: {view()?.startTitle}</span>}
        >
          <button
            class="btn wr-back-btn"
            disabled={view()?.loading}
            onClick={handleBackClick}
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
        <div class="wr-notice-banner">{view()?.error}</div>
      </Show>

      <Show when={view()?.phase === 'LOADING'}>
        <div class="wr-status-card">
          <Show when={!view()?.error}>
            <div class="spinner" />
            <p class="wr-status-title">Loading {view()?.startTitle}...</p>
          </Show>
        </div>
      </Show>

      <Show when={view()?.phase === 'RESULTS'}>
        <div class="wr-mobile-results">
          <div class="wr-winner-banner">
            <h2 class="wr-winner-headline">
              {view()?.winnerName ?? 'Winner'} won in {winnerHops()} hops!
            </h2>

            <Show when={(view()?.winnerPath.length ?? 0) > 0}>
              <div class="wr-path-chain wr-path-chain-mobile">
                <For each={view()?.winnerPath ?? []}>
                  {(step, idx) => (
                    <>
                      <Show when={idx() > 0}>
                        <span class="wr-path-arrow">→</span>
                      </Show>
                      <span
                        class={`wr-path-step ${idx() === (view()?.winnerPath.length ?? 0) - 1 ? 'is-active' : ''}`}
                      >
                        {step}
                      </span>
                    </>
                  )}
                </For>
              </div>
            </Show>
          </div>

          <ResultList
            compact
            players={props.state.players}
            entries={entries()}
          />
        </div>
      </Show>

      <Show when={view()?.phase === 'RACING'}>
        <div class="wr-article-header">
          <h1 class="wr-article-title">{view()?.currentTitle}</h1>
          <Show when={view()?.loadingTitle || view()?.loading}>
            <span class="wr-loading-pill">
              {view()?.loadingTitle ? `Loading ${view()?.loadingTitle}...` : 'Loading...'}
            </span>
          </Show>
        </div>

        <div
          ref={(el) => (articleRef = el)}
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
  name: 'Wikipedia',
  TvView: WikiRaceTvView,
  MobileView: WikiRaceMobileView,
};
