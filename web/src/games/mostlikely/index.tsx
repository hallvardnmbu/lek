import { For, Show } from 'solid-js';
import type {
  MostLikelyHostView,
  MostLikelyPlayerView,
} from '../../../../shared/games/mostlikely';
import { TallyList } from '../../components/TallyList';
import { secondsLeft, type GameUiDefinition, type MobileGameViewProps, type TvGameViewProps } from '../registry';
import './mostlikely.css';

function toTallyEntries(tally: MostLikelyHostView['tally']) {
  return tally.map((entry) => ({
    playerId: entry.playerId,
    name: entry.name,
    votes: entry.votes,
    highlighted: entry.isDrinker,
  }));
}

function MostLikelyTvView(props: TvGameViewProps<MostLikelyHostView>) {
  const host = () => props.state.hostState;

  return (
    <div class="tv-phase-center">
      <Show
        when={host()?.phase !== 'GENERATING'}
        fallback={
          <div class="ml-generating">
            <div class="spinner" />
            <h1 class="tv-hero-title">Most Likely To</h1>
            <p class="tv-hero-sub">The AI is cooking up questionable material…</p>
          </div>
        }
      >
        <p class="eyebrow">
          ROUND {host()?.round} OF {host()?.totalRounds}
          <Show when={host()?.promptIsAi}>
            <span class="ml-ai-tag">AI PROMPT</span>
          </Show>
        </p>
        <h1 class="ml-tv-prompt">
          <span class="ml-tv-lead">Who is most likely to</span>
          {host()?.prompt}?
        </h1>

        <Show
          when={host()?.phase === 'VOTING'}
          fallback={
            <>
              <TallyList entries={toTallyEntries(host()?.tally ?? [])} badgeLabel="DRINKS" />
              <p class="ml-next-hint">
                <Show
                  when={(host()?.round ?? 0) < (host()?.totalRounds ?? 0)}
                  fallback="Final results coming up…"
                >
                  Next round in {secondsLeft(props.remainingMs)}s
                </Show>
              </p>
            </>
          }
        >
          <p class="ml-vote-progress">
            {host()?.votedCount}/{host()?.connectedCount} votes in · {secondsLeft(props.remainingMs)}s
          </p>
          <p class="tv-hero-sub">Vote on your phone. Majority verdict drinks.</p>
        </Show>

        <div class="tv-action-bar">
          <button class="btn btn-tv" onClick={() => props.sendAction({ type: 'next' })}>
            {host()?.phase === 'VOTING' ? 'Reveal Now' : 'Next Round'}
          </button>
          <button class="btn btn-tv" onClick={props.endGame}>
            End Game
          </button>
        </div>
      </Show>
    </div>
  );
}

function MostLikelyMobileView(props: MobileGameViewProps<MostLikelyPlayerView>) {
  const view = () => props.state.playerState;

  return (
    <div class="mobile-card">
      <div class="ml-mobile-head">
        <span>
          Round {view()?.round}/{view()?.totalRounds}
        </span>
        <span class="ml-drinks-count">{view()?.myDrinks ?? 0} drinks</span>
      </div>

      <Show
        when={view()?.phase !== 'GENERATING'}
        fallback={<p class="muted ml-scheming">The AI is scheming… hold tight.</p>}
      >
        <h2 class="ml-mobile-prompt">Who is most likely to {view()?.prompt}?</h2>

        <Show
          when={view()?.phase === 'VOTING'}
          fallback={
            <>
              <Show when={view()?.iAmDrinking} fallback={<p class="ml-reveal-wait">The people have spoken.</p>}>
                <p class="ml-drink-verdict">The verdict is you. Drink up.</p>
              </Show>
              <TallyList entries={toTallyEntries(view()?.tally ?? [])} badgeLabel="DRINKS" compact />
            </>
          }
        >
          <p class="muted ml-vote-hint">
            Tap the guilty one. You can change your mind until reveal.
          </p>
          <div class="ml-candidates">
            <For each={view()?.candidates ?? []}>
              {(candidate) => (
                <button
                  class={`btn btn-block btn-vote ml-candidate ${view()?.myVote === candidate.id ? 'ml-voted' : ''}`}
                  onClick={() =>
                    props.sendAction({ type: 'vote', payload: { targetId: candidate.id } })
                  }
                >
                  {candidate.name}
                </button>
              )}
            </For>
          </div>
          <p class="muted ml-voted-progress">
            {view()?.votedCount}/{view()?.connectedCount} voted
          </p>
        </Show>
      </Show>
    </div>
  );
}

export const mostLikelyGameUi: GameUiDefinition<MostLikelyHostView, MostLikelyPlayerView> = {
  id: 'most-likely',
  name: 'Most Likely To',
  TvView: MostLikelyTvView,
  MobileView: MostLikelyMobileView,
};
