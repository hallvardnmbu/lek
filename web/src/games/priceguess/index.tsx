import { Show, createEffect, createMemo, createSignal } from 'solid-js';
import type {
  PriceGuessHostView,
  PriceGuessPlayerView,
} from '../../../../shared/games/priceguess';
import { ResultList, type ResultListEntry } from '../../components/ResultList';
import { TvActedArms } from '../../components/tv/TvActedArms';
import {
  secondsLeft,
  type GameUiDefinition,
  type MobileGameViewProps,
  type TvGameViewProps,
} from '../registry';
import './priceguess.css';

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return Number.isInteger(value) ? `${value} kr` : `${value.toFixed(2)} kr`;
}

function PriceGuessTvView(props: TvGameViewProps<PriceGuessHostView>) {
  const host = () => props.state.hostState;
  const product = () => host()?.product;

  const resultEntries = createMemo<ResultListEntry[]>(() =>
    (host()?.players ?? []).map((player) => ({
      playerId: player.playerId,
      name: player.name,
      detail:
        player.guess !== null
          ? `${formatPrice(player.guess)}${player.diff !== null ? ` · ±${formatPrice(player.diff)}` : ''}`
          : 'No guess',
      badge: player.drinks ? 'DRINK' : undefined,
      badgeTone: 'loser',
      tone: player.drinks ? 'loser' : 'default',
      stat: `${player.score} pts`,
    }))
  );

  return (
    <div class="tv-phase-center pg-tv-wrap">
      <div class="guess-tv-header pg-tv-header">
        <p class="eyebrow">
          PRICE · ROUND {host()?.round ?? 1} OF {host()?.totalRounds ?? 3}
        </p>
        <Show when={host()?.phase === 'GUESSING' && props.remainingMs !== null}>
          <span class="pg-tv-timer">{secondsLeft(props.remainingMs)}s</span>
        </Show>
      </div>

      <Show when={host()?.error}>
        <p class="pg-error-banner">{host()?.error}</p>
      </Show>

      <Show when={host()?.phase === 'LOADING'}>
        <div class="guess-tv-loading pg-tv-loading">
          <div class="spinner" />
          <p class="tv-hero-sub">Picking a bottle</p>
        </div>
      </Show>

      <Show when={host()?.phase === 'GUESSING' || host()?.phase === 'REVEAL'}>
        <div class="pg-tv-stage">
          <div class="pg-tv-product">
            <Show when={product()?.imageUrl}>
              {(url) => (
                <div class="pg-tv-image-box">
                  <img class="pg-tv-image" src={url()} alt={product()?.name ?? 'Product'} />
                </div>
              )}
            </Show>

            <div class="pg-tv-info">
              <h2 class="pg-tv-name">{product()?.name}</h2>

              <div class="pg-tv-tags">
                <Show when={product()?.category}>
                  <span class="pg-tag">{product()?.category}</span>
                </Show>
                <Show when={product()?.subcategory}>
                  <span class="pg-tag">{product()?.subcategory}</span>
                </Show>
                <Show when={product()?.country}>
                  <span class="pg-tag">
                    {product()?.country}
                    {product()?.district ? ` · ${product()?.district}` : ''}
                  </span>
                </Show>
                <Show when={product()?.year}>
                  <span class="pg-tag">{product()?.year}</span>
                </Show>
                <Show when={product()?.alcohol}>
                  <span class="pg-tag">{product()?.alcohol}%</span>
                </Show>
              </div>

              <Show when={product()?.description}>
                <p class="pg-tv-desc">{product()?.description}</p>
              </Show>

              <Show when={host()?.phase === 'REVEAL'}>
                <div class="pg-tv-actual">
                  <span class="pg-tv-actual-label">ACTUAL PRICE</span>
                  <span class="pg-tv-actual-value">{formatPrice(host()?.actualPrice)}</span>
                </div>
              </Show>
            </div>
          </div>

          <Show when={host()?.phase === 'REVEAL'}>
            <div class="guess-tv-results">

              <ResultList players={props.state.players} entries={resultEntries()} />
            </div>
          </Show>
        </div>
      </Show>

      <Show when={host()?.phase === 'GUESSING'}>
        <TvActedArms players={props.state.players} actedIds={host()?.lockedPlayerIds ?? []} />
      </Show>
    </div>
  );
}

function PriceGuessMobileView(props: MobileGameViewProps<PriceGuessPlayerView>) {
  const view = () => props.state.playerState;
  const [draft, setDraft] = createSignal('');

  createEffect(
    () => view()?.round,
    () => {
      setDraft('');
    }
  );

  const parsedPrice = () => {
    const normalized = draft().replace(',', '.').trim();
    if (!normalized) return null;
    const n = Number(normalized);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const submitGuess = (e: Event) => {
    e.preventDefault();
    const price = parsedPrice();
    if (price === null) return;
    props.sendAction({
      type: 'submit_guess',
      payload: { price },
    });
  };

  return (
    <div class="guess-mobile-wrap pg-mobile-wrap">
      <div class="guess-mobile-header">
        <span class="eyebrow">
          PRICE · ROUND {view()?.round ?? 1} OF {view()?.totalRounds ?? 3}
        </span>
        <Show when={view()?.phase === 'GUESSING' && props.remainingMs !== null}>
          <span class="guess-mobile-timer pg-mobile-timer">{secondsLeft(props.remainingMs)}s</span>
        </Show>
      </div>

      <Show when={view()?.phase === 'LOADING'}>
        <div class="guess-mobile-wait pg-mobile-wait">
          <div class="spinner" />
          <p>Picking a bottle</p>
        </div>
      </Show>

      <Show when={view()?.phase === 'GUESSING'}>
        <Show
          when={!view()?.lockedIn}
          fallback={
            <div class="guess-mobile-wait pg-mobile-wait">
              <p class="guess-mobile-locked-title pg-mobile-locked-title">Guess Locked In!</p>
              <p class="pg-mobile-locked-price">{formatPrice(view()?.guess)}</p>
              <p class="guess-mobile-sub">Waiting for others</p>
            </div>
          }
        >
          <form class="pg-mobile-form" onSubmit={submitGuess}>
            <p class="pg-mobile-product">{view()?.productName ?? 'Mystery Bottle'}</p>
            <label class="pg-mobile-label" for="pg-price-input">
              What does it cost? (kr)
            </label>
            <input
              id="pg-price-input"
              class="pg-mobile-input"
              type="number"
              inputmode="decimal"
              min="0"
              step="any"
              placeholder="e.g. 249"
              value={draft()}
              onInput={(e) => setDraft(e.currentTarget.value)}
            />
            <button
              class="btn btn-primary btn-block"
              type="submit"
              disabled={parsedPrice() === null}
            >
              Lock In Guess
            </button>
          </form>
        </Show>
      </Show>

      <Show when={view()?.phase === 'REVEAL'}>
        <div
          class={`guess-mobile-result pg-mobile-result ${view()?.isWinner ? 'is-winner' : ''} ${view()?.drinks ? 'is-drinker' : ''}`}
        >
          <Show when={view()?.isWinner}>
            <p class="guess-mobile-verdict pg-mobile-verdict">CLOSEST! YOU WIN</p>
          </Show>
          <Show when={view()?.drinks}>
            <p class="guess-mobile-verdict pg-mobile-verdict">
              {view()?.guess === null ? 'NO GUESS. DRINK!' : 'FURTHEST OFF. DRINK!'}
            </p>
          </Show>
          <Show when={!view()?.isWinner && !view()?.drinks}>
            <p class="guess-mobile-verdict pg-mobile-verdict">YOU ARE SAFE</p>
          </Show>

          <p class="pg-mobile-actual">{formatPrice(view()?.actualPrice)}</p>
          <p class="pg-mobile-product-small">{view()?.productName}</p>
          <p class="pg-mobile-diff">
            {view()?.guess !== null
              ? `Your guess: ${formatPrice(view()?.guess)} (±${formatPrice(view()?.diff)})`
              : 'No guess submitted'}
          </p>
        </div>
      </Show>
    </div>
  );
}

export const priceGuessGameUi: GameUiDefinition<PriceGuessHostView, PriceGuessPlayerView> = {
  id: 'priceguess',
  name: 'Price',
  TvView: PriceGuessTvView,
  MobileView: PriceGuessMobileView,
};
