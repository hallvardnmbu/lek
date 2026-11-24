import { For, Show } from 'solid-js';
import type {
  CategoriesHostView,
  CategoriesPlayerView,
} from '../../../../shared/games/categories';
import { TallyList } from '../../components/TallyList';
import { TvActedArms } from '../../components/tv/TvActedArms';
import type { GameUiDefinition, MobileGameViewProps, TvGameViewProps } from '../registry';
import './categories.css';

function toTallyEntries(tally: CategoriesHostView['tally']) {
  return tally.map((entry) => ({
    playerId: entry.playerId,
    name: entry.name,
    votes: entry.votes,
    highlighted: entry.isFailed,
  }));
}

function CategoriesTvView(props: TvGameViewProps<CategoriesHostView>) {
  const host = () => props.state.hostState;

  return (
    <div class="tv-phase-center">
      <Show
        when={host()?.phase !== 'GENERATING'}
        fallback={
          <div class="vote-generating">
            <div class="spinner" />
            <h1 class="tv-hero-title">Categories</h1>
            <p class="tv-hero-sub">Picking a category</p>
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

        <h1 class="cat-tv-category">{host()?.category}</h1>

        <Show when={host()?.phase === 'REVEAL'}>
          <TallyList
            entries={toTallyEntries(host()?.tally ?? [])}
            players={props.state.players}
            badgeLabel="FAILED"
            tone="loser"
          />
        </Show>
      </Show>
    </div>
  );
}

function CategoriesMobileView(props: MobileGameViewProps<CategoriesPlayerView>) {
  const view = () => props.state.playerState;

  return (
    <div class="mobile-card cat-mobile">
      <div class="vote-mobile-head">
        <span>
          Round {view()?.round}/{view()?.totalRounds}
        </span>
        <span class="vote-head-stat">{view()?.myScore ?? 0} pts</span>
      </div>

      <Show
        when={view()?.phase !== 'GENERATING'}
        fallback={<p class="muted vote-waiting">Picking a category</p>}
      >
        <p class="cat-mobile-eyebrow">CATEGORY</p>
        <h2 class="cat-mobile-category">{view()?.category}</h2>

        <Show
          when={view()?.phase === 'PLAYING'}
          fallback={
            <>
              <Show
                when={view()?.iFailed}
                fallback={<p class="cat-result-safe">You survived! +1 pt</p>}
              >
                <p class="cat-result-fail">You failed this round!</p>
              </Show>
              <TallyList
                entries={toTallyEntries(view()?.tally ?? [])}
                players={props.state.players}
                badgeLabel="FAILED"
                tone="loser"
                compact
              />
              <button
                class={`btn btn-primary cat-continue-btn ${view()?.myContinueVote ? 'is-voted' : ''}`}
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
            Go around until someone fails, then vote who failed.
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

export const categoriesGameUi: GameUiDefinition<CategoriesHostView, CategoriesPlayerView> = {
  id: 'categories',
  name: 'Categories',
  TvView: CategoriesTvView,
  MobileView: CategoriesMobileView,
};
