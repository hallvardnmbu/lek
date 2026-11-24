import { Show, createEffect, createMemo, createSignal } from 'solid-js';
import type {
  GeoGuessHostView,
  GeoGuessPlayerView,
  GeoPoint,
} from '../../../../shared/games/geoguess';
import { ResultList, type ResultListEntry } from '../../components/ResultList';
import { TvActedArms } from '../../components/tv/TvActedArms';
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

  const resultEntries = createMemo<ResultListEntry[]>(() =>
    (host()?.players ?? []).map((player) => ({
      playerId: player.playerId,
      name: player.name,
      swatchColor: player.color,
      detail: player.distanceKm !== null ? `${player.distanceKm} km` : 'No guess',
      badge: player.isWinner
        ? `WIN +${player.roundPoints ?? 0}`
        : player.drinks
          ? 'DRINK'
          : player.roundPoints !== null
            ? `+${player.roundPoints}`
            : undefined,
      badgeTone: player.isWinner ? 'accent' : player.drinks ? 'loser' : 'muted',
      tone: player.isWinner ? 'accent' : player.drinks ? 'loser' : 'default',
      stat: `${player.score} pts`,
    }))
  );

  return (
    <div class="tv-phase-center geo-tv-wrap">
      <div class="guess-tv-header">
        <p class="eyebrow">
          PINPOINT · ROUND {host()?.round ?? 1} OF {host()?.totalRounds ?? 5}
        </p>
        <Show when={host()?.phase === 'GUESSING' && props.remainingMs !== null}>
          <span class="geo-tv-timer">{secondsLeft(props.remainingMs)}s</span>
        </Show>
      </div>

      <Show when={host()?.error}>
        <p class="geo-error-banner">{host()?.error}</p>
      </Show>

      <Show when={host()?.phase === 'LOADING'}>
        <div class="guess-tv-loading geo-tv-loading">
          <div class="spinner" />
          <p class="tv-hero-sub">Finding a spot</p>
        </div>
      </Show>

      <Show when={host()?.phase === 'GUESSING'}>
        <div class="geo-tv-spot-frame">
          <Show when={host()?.imageUrl}>
            {(url) => <img class="geo-tv-spot-img" src={url()} alt="Mystery location" />}
          </Show>
        </div>
        <TvActedArms players={props.state.players} actedIds={host()?.lockedPlayerIds ?? []} />
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

          <div class="guess-tv-results">
            <Show when={host()?.winnerName}>
              <div class="guess-tv-callout geo-tv-callout is-winner">
                Closest: <strong>{host()?.winnerName}</strong>
              </div>
            </Show>
            <Show when={(host()?.drinkerNames.length ?? 0) > 0}>
              <div class="guess-tv-callout geo-tv-callout is-drinker">
                Last place: <strong>{host()?.drinkerNames.join(', ')}</strong> · DRINK!
              </div>
            </Show>

            <ResultList
              players={props.state.players}
              entries={resultEntries()}
              class="geo-tv-board"
            />
          </div>
        </div>
      </Show>
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
    <div class="guess-mobile-wrap geo-mobile-wrap">
      <div class="guess-mobile-header">
        <span class="eyebrow">
          ROUND {view()?.round ?? 1} OF {view()?.totalRounds ?? 5}
        </span>
        <Show when={view()?.phase === 'GUESSING' && props.remainingMs !== null}>
          <span class="guess-mobile-timer">{secondsLeft(props.remainingMs)}s</span>
        </Show>
      </div>

      <Show when={view()?.phase === 'LOADING'}>
        <div class="guess-mobile-wait geo-mobile-wait">
          <div class="spinner" />
          <p>Loading location</p>
        </div>
      </Show>

      <Show when={view()?.phase === 'GUESSING'}>
        <Show
          when={!view()?.lockedIn}
          fallback={
            <div class="guess-mobile-wait geo-mobile-wait">
              <p class="guess-mobile-locked-title geo-mobile-locked-title">Guess Locked In!</p>
              <p class="guess-mobile-sub">Waiting for others</p>
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
          class={`guess-mobile-result geo-mobile-result ${view()?.isWinner ? 'is-winner' : ''} ${view()?.drinks ? 'is-drinker' : ''}`}
        >
          <Show when={view()?.isWinner}>
            <p class="guess-mobile-verdict geo-mobile-verdict">CLOSEST! YOU WIN</p>
          </Show>
          <Show when={view()?.drinks}>
            <p class="guess-mobile-verdict geo-mobile-verdict">LAST PLACE. DRINK!</p>
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
      </Show>
    </div>
  );
}

export const geoGuessGameUi: GameUiDefinition<GeoGuessHostView, GeoGuessPlayerView> = {
  id: 'geoguess',
  name: 'Pinpoint',
  TvView: GeoGuessTvView,
  MobileView: GeoGuessMobileView,
};
