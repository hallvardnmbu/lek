import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';
import type {
  GeoGuessHostView,
  GeoGuessPlayerView,
  GeoPoint,
} from '../../../../shared/games/geoguess';
import {
  secondsLeft,
  type GameUiDefinition,
  type MobileGameViewProps,
  type TvGameViewProps,
} from '../registry';
import { TileMap, type MapMarker } from './TileMap';
import './geoguess.css';

function GeoGuessTvView(props: TvGameViewProps<GeoGuessHostView>) {
  const host = () => props.state.hostState;

  const revealMarkers = createMemo<MapMarker[]>(() => {
    const h = host();
    if (!h || h.phase !== 'REVEAL') return [];
    return h.players.flatMap((p) =>
      p.guess ? [{ id: p.playerId, label: p.name, color: p.color, point: p.guess }] : []
    );
  });

  return (
    <div class="tv-phase-center geo-tv-wrap">
      <div class="geo-tv-header">
        <p class="eyebrow">
          GEO-GUESS ROULETTE · ROUND {host()?.round ?? 1} OF {host()?.totalRounds ?? 5}
        </p>
        <Show when={host()?.phase === 'GUESSING' && props.remainingMs !== null}>
          <span class="geo-tv-timer">{secondsLeft(props.remainingMs)}s</span>
        </Show>
      </div>

      <Show when={host()?.error}>
        <p class="geo-error-banner">{host()?.error}</p>
      </Show>

      <Show when={host()?.phase === 'LOADING'}>
        <div class="geo-tv-loading">
          <div class="spinner" />
          <p class="tv-hero-sub">Finding a spot</p>
        </div>
      </Show>

      <Show when={host()?.phase === 'GUESSING'}>
        <div class="geo-tv-spot-frame">
          <Show when={host()?.imageUrl}>
            {(url) => <img class="geo-tv-spot-img" src={url()} alt="Mystery location" />}
          </Show>
          <div class="geo-tv-lock-pill">
            {host()?.lockedCount ?? 0} / {host()?.totalCount ?? 0} locked in
          </div>
        </div>
      </Show>

      <Show when={host()?.phase === 'REVEAL'}>
        <div class="geo-tv-reveal-grid">
          <div class="geo-tv-reveal-map-box">
            <TileMap
              class="geo-tv-map"
              target={host()?.target}
              markers={revealMarkers()}
              fitAll={true}
            />
            <Show when={host()?.spotLabel}>
              <div class="geo-tv-spot-badge">{host()?.spotLabel}</div>
            </Show>
          </div>

          <div class="geo-tv-results">
            <Show when={host()?.winnerName}>
              <div class="geo-tv-callout is-winner">
                Closest: <strong>{host()?.winnerName}</strong>
              </div>
            </Show>
            <Show when={host()?.drinkerName}>
              <div class="geo-tv-callout is-drinker">
                Last place: <strong>{host()?.drinkerName}</strong>. DRINKS!
              </div>
            </Show>

            <div class="geo-tv-board">
              <For each={host()?.players ?? []}>
                {(player) => (
                  <div
                    class={`geo-tv-row ${player.isWinner ? 'is-winner' : ''} ${player.drinks ? 'is-drinker' : ''}`}
                  >
                    <span
                      class="geo-tv-swatch"
                      style={{ background: player.color }}
                    />
                    <span class="geo-tv-name">{player.name}</span>
                    <span class="geo-tv-dist">
                      {player.distanceKm !== null ? `${player.distanceKm} km` : 'No guess'}
                    </span>
                    <span class="geo-tv-badge">
                      {player.isWinner
                        ? `WIN +${player.roundPoints ?? 0}`
                        : player.drinks
                          ? 'DRINK'
                          : player.roundPoints !== null
                            ? `+${player.roundPoints}`
                            : '-'}
                    </span>
                    <span class="geo-tv-total">{player.score} pts</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>

      <div class="tv-action-bar">
        <Show when={host()?.phase === 'GUESSING'}>
          <button class="btn btn-tv" onClick={() => props.sendAction({ type: 'skip_spot' })}>
            Skip Spot
          </button>
        </Show>
        <Show when={host()?.phase === 'REVEAL' || host()?.error}>
          <button class="btn btn-tv" onClick={() => props.sendAction({ type: 'next_round' })}>
            {(host()?.round ?? 1) >= (host()?.totalRounds ?? 5) ? 'Finish' : 'Next Round'}
          </button>
        </Show>
        <button class="btn btn-tv" onClick={props.endGame}>
          End Game
        </button>
      </div>
    </div>
  );
}

function GeoGuessMobileView(props: MobileGameViewProps<GeoGuessPlayerView>) {
  const view = () => props.state.playerState;
  const [draftPin, setDraftPin] = createSignal<GeoPoint | null>(null);

  createEffect(
    () => view()?.round,
    () => {
      setDraftPin(null);
    }
  );

  const submitGuess = () => {
    const pin = draftPin();
    if (!pin) return;
    props.sendAction({
      type: 'submit_guess',
      payload: { lat: pin.lat, lng: pin.lng },
    });
  };

  return (
    <div class="geo-mobile-wrap">
      <div class="geo-mobile-header">
        <span class="eyebrow">
          ROUND {view()?.round ?? 1} OF {view()?.totalRounds ?? 5}
        </span>
        <Show when={view()?.phase === 'GUESSING' && props.remainingMs !== null}>
          <span class="geo-mobile-timer">{secondsLeft(props.remainingMs)}s</span>
        </Show>
      </div>

      <Show when={view()?.phase === 'LOADING'}>
        <div class="geo-mobile-wait">
          <div class="spinner" />
          <p>Loading location</p>
        </div>
      </Show>

      <Show when={view()?.phase === 'GUESSING'}>
        <Show
          when={!view()?.lockedIn}
          fallback={
            <div class="geo-mobile-wait">
              <p class="geo-mobile-locked-title">Guess Locked In!</p>
              <p class="geo-mobile-sub">Waiting for others</p>
            </div>
          }
        >
          <p class="geo-mobile-hint">Drag to pan, tap anywhere to drop your pin</p>
          <TileMap
            class="geo-mobile-map"
            interactive={true}
            selectedPin={draftPin()}
            onSelectPin={(pt) => setDraftPin(pt)}
          />
          <button
            class="btn geo-mobile-submit"
            disabled={!draftPin()}
            onClick={submitGuess}
          >
            {draftPin() ? 'Lock In Guess' : 'Tap Map to Place Pin'}
          </button>
        </Show>
      </Show>

      <Show when={view()?.phase === 'REVEAL'}>
        <div
          class={`geo-mobile-result ${view()?.isWinner ? 'is-winner' : ''} ${view()?.drinks ? 'is-drinker' : ''}`}
        >
          <Show when={view()?.isWinner}>
            <p class="geo-mobile-verdict">CLOSEST! YOU WIN</p>
          </Show>
          <Show when={view()?.drinks}>
            <p class="geo-mobile-verdict">LAST PLACE. DRINK!</p>
          </Show>

          <p class="geo-mobile-spot">{view()?.spotLabel ?? 'Location revealed'}</p>
          <p class="geo-mobile-distance">
            {view()?.distanceKm != null ? `${view()!.distanceKm} km away` : 'No guess submitted'}
          </p>
          <Show when={view()?.roundPoints != null}>
            <p class="geo-mobile-points">+{view()!.roundPoints} pts</p>
          </Show>
        </div>

        <Show when={view()?.target}>
          <TileMap
            class="geo-mobile-reveal-map"
            target={view()?.target}
            markers={
              view()?.guess
                ? [{ id: 'me', label: 'You', color: '#38bdf8', point: view()!.guess! }]
                : []
            }
            fitAll={true}
          />
        </Show>

        <button
          class="btn geo-mobile-submit"
          onClick={() => props.sendAction({ type: 'next_round' })}
        >
          {(view()?.round ?? 1) >= (view()?.totalRounds ?? 5) ? 'Finish' : 'Next Round'}
        </button>
      </Show>
    </div>
  );
}

export const geoGuessGameUi: GameUiDefinition<GeoGuessHostView, GeoGuessPlayerView> = {
  id: 'geoguess',
  name: 'Geo-Guess Roulette',
  TvView: GeoGuessTvView,
  MobileView: GeoGuessMobileView,
};
