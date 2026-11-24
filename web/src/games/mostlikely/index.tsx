import { For, Show } from 'solid-js';
import type {
  MostLikelyHostView,
  MostLikelyPlayerView,
} from '../../../../shared/games/mostlikely';
import { TallyList } from '../../components/TallyList';
import { TvActedArms } from '../../components/tv/TvActedArms';
import type { GameUiDefinition, MobileGameViewProps, TvGameViewProps } from '../registry';
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
          <div class="vote-generating">
            <div class="spinner" />
            <h1 class="tv-hero-title">Likely</h1>
            <p class="tv-hero-sub">Generating prompt</p>
          </div>
        }
      >
        <TvActedArms
          players={props.state.players}
          actedIds={
            host()?.phase === 'REVEAL'
              ? (host()?.continuePlayerIds ?? [])
              : (host()?.votedPlayerIds ?? [])
          }
        />

        <p class="eyebrow vote-eyebrow">
          ROUND {host()?.round} OF {host()?.totalRounds}
        </p>

        <h1 class="ml-tv-prompt">
          <span class="ml-tv-lead">Who is most likely to</span>
          {host()?.prompt}?
        </h1>

        <Show when={host()?.phase === 'REVEAL'}>
          <TallyList
            entries={toTallyEntries(host()?.tally ?? [])}
            players={props.state.players}
            badgeLabel="DRINKS"
            tone="accent"
          />
        </Show>
      </Show>
    </div>
  );
}

function MostLikelyMobileView(props: MobileGameViewProps<MostLikelyPlayerView>) {
  const view = () => props.state.playerState;

  return (
    <div class="mobile-card">
      <div class="vote-mobile-head">
        <span>
          Round {view()?.round}/{view()?.totalRounds}
        </span>
        <span class="vote-head-stat">{view()?.myDrinks ?? 0} drinks</span>
      </div>

      <Show
        when={view()?.phase !== 'GENERATING'}
        fallback={<p class="muted vote-waiting">Generating prompt</p>}
      >
        <h2 class="ml-mobile-prompt">Who is most likely to {view()?.prompt}?</h2>

        <Show
          when={view()?.phase === 'VOTING'}
          fallback={
            <>
              <Show
                when={view()?.iAmDrinking}
                fallback={<p class="ml-reveal-wait">The people have spoken.</p>}
              >
                <p class="ml-drink-verdict">The verdict is you. Drink up.</p>
              </Show>
              <TallyList
                entries={toTallyEntries(view()?.tally ?? [])}
                players={props.state.players}
                badgeLabel="DRINKS"
                tone="accent"
                compact
              />
              <button
                class={`btn btn-primary ml-continue-btn ${view()?.myContinueVote ? 'is-voted' : ''}`}
                onClick={() => props.sendAction({ type: 'continue' })}
              >
                {view()?.myContinueVote ? 'Ready' : 'Continue'}
              </button>
              <p class="muted vote-tally-note">
                {view()?.continueCount}/{view()?.connectedCount} ready
              </p>
            </>
          }
        >
          <p class="muted vote-hint">
            Tap the guilty one. You can change your mind until reveal.
          </p>
          <div class="vote-candidates">
            <For each={view()?.candidates ?? []}>
              {(candidate) => (
                <button
                  class={`btn btn-block btn-vote vote-candidate ${view()?.myVote === candidate.id ? 'is-voted' : ''}`}
                  onClick={() =>
                    props.sendAction({ type: 'vote', payload: { targetId: candidate.id } })
                  }
                >
                  {candidate.name}
                </button>
              )}
            </For>
          </div>
          <p class="muted vote-tally-note">
            {view()?.votedCount}/{view()?.connectedCount} voted
          </p>
        </Show>
      </Show>
    </div>
  );
}

export const mostLikelyGameUi: GameUiDefinition<MostLikelyHostView, MostLikelyPlayerView> = {
  id: 'most-likely',
  name: 'Likely',
  TvView: MostLikelyTvView,
  MobileView: MostLikelyMobileView,
};
