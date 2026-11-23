import { For, Show, createEffect, createSignal } from 'solid-js';
import type {
  PriceGuessHostView,
  PriceGuessPlayerView,
} from '../../../../shared/games/priceguess';
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

  return (
    <div class="tv-phase-center pg-tv-wrap">
      <div class="guess-tv-header pg-tv-header">
        <p class="eyebrow">PRICE · ROUND {host()?.round ?? 1}</p>
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

              <Show when={host()?.phase === 'GUESSING'}>
                <div class="pg-tv-lock-pill">
                  {host()?.lockedCount ?? 0} / {host()?.totalCount ?? 0} locked in
                </div>
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
              <Show when={host()?.winnerName}>
                <div class="guess-tv-callout pg-tv-callout is-winner">
                  Closest: <strong>{host()?.winnerName}</strong>
                </div>
              </Show>
              <Show when={host()?.drinkerName}>
                <div class="guess-tv-callout pg-tv-callout is-drinker">
                  Furthest: <strong>{host()?.drinkerName}</strong>. DRINKS!
                </div>
              </Show>

              <div class="guess-tv-board">
                <For each={host()?.players ?? []}>
                  {(player) => (
                    <div
                      class={`guess-tv-row pg-tv-row ${player.isWinner ? 'is-winner' : ''} ${player.drinks ? 'is-drinker' : ''}`}
                    >
                      <span class="pg-tv-player">{player.name}</span>
                      <span class="pg-tv-guess">
                        {player.guess !== null ? formatPrice(player.guess) : 'No guess'}
                      </span>
                      <span class="pg-tv-diff">
                        {player.diff !== null ? `±${formatPrice(player.diff)}` : ''}
                      </span>
                      <span class="guess-tv-badge pg-tv-badge">
                        {player.isWinner ? 'WIN' : player.drinks ? 'DRINK' : `${player.score} pts`}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      <div class="tv-action-bar">
        <Show when={host()?.phase === 'GUESSING'}>
          <button class="btn btn-tv" onClick={() => props.sendAction({ type: 'skip_product' })}>
            Skip Bottle
          </button>
        </Show>
        <Show when={host()?.phase === 'REVEAL' || host()?.error}>
          <button class="btn btn-tv" onClick={() => props.sendAction({ type: 'next_round' })}>
            Next Round
          </button>
        </Show>
        <button class="btn btn-tv" onClick={props.endGame}>
          End Game
        </button>
      </div>
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
        <span class="eyebrow">ROUND {view()?.round ?? 1}</span>
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
            <p class="guess-mobile-verdict pg-mobile-verdict">FURTHEST OFF. DRINK!</p>
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

        <button
          class="btn btn-primary btn-block"
          onClick={() => props.sendAction({ type: 'next_round' })}
        >
          Next Round
        </button>
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
