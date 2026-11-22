import { For, Show } from 'solid-js';
import type {
  CategoriesHostView,
  CategoriesPlayerView,
} from '../../../../shared/games/categories';
import { TallyList } from '../../components/TallyList';
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
          <div class="cat-generating">
            <div class="spinner" />
            <h1 class="tv-hero-title">Categories</h1>
            <p class="tv-hero-sub">The AI is picking a category…</p>
          </div>
        }
      >
        <p class="eyebrow">
          ROUND {host()?.round} OF {host()?.totalRounds}
          <Show when={host()?.categoryIsAi}>
            <span class="cat-ai-tag">AI CATEGORY</span>
          </Show>
        </p>

        <h1 class="cat-tv-category">{host()?.category}</h1>

        <Show
          when={host()?.phase === 'PLAYING'}
          fallback={
            <>
              <TallyList entries={toTallyEntries(host()?.tally ?? [])} badgeLabel="FAILED" tone="danger" />
              <p class="cat-next-hint">
                {host()?.continueCount}/{host()?.connectedCount} ready to continue
              </p>
            </>
          }
        >
          <p class="cat-vote-progress">
            {host()?.votedCount}/{host()?.connectedCount} voted who failed
          </p>
          <p class="tv-hero-sub">
            Go around the room naming items. When someone fails, vote on your phones.
          </p>
        </Show>

        <div class="tv-action-bar cat-tv-actions">
          <button class="btn btn-tv" onClick={() => props.sendAction({ type: 'next' })}>
            {host()?.phase === 'PLAYING'
              ? 'Reveal Now'
              : (host()?.round ?? 0) < (host()?.totalRounds ?? 0)
                ? 'Next Category'
                : 'Finish Game'}
          </button>
          <button class="btn btn-tv" onClick={props.endGame}>
            End Game
          </button>
        </div>
      </Show>
    </div>
  );
}

function CategoriesMobileView(props: MobileGameViewProps<CategoriesPlayerView>) {
  const view = () => props.state.playerState;

  return (
    <div class="mobile-card cat-mobile">
      <div class="cat-mobile-head">
        <span>
          Round {view()?.round}/{view()?.totalRounds}
        </span>
        <span class="cat-score-count">{view()?.myScore ?? 0} pts</span>
      </div>

      <Show
        when={view()?.phase !== 'GENERATING'}
        fallback={<p class="muted cat-waiting">Picking a category… hold tight.</p>}
      >
        <p class="cat-mobile-eyebrow">CATEGORY</p>
        <h2 class="cat-mobile-category">{view()?.category}</h2>

        <Show
          when={view()?.phase === 'PLAYING'}
          fallback={
            <>
              <Show
                when={view()?.iFailed}
                fallback={<p class="cat-result-safe">You survived! +1 pt.</p>}
              >
                <p class="cat-result-fail">You failed this round!</p>
              </Show>
              <TallyList entries={toTallyEntries(view()?.tally ?? [])} badgeLabel="FAILED" tone="danger" compact />
              <button
                class={`btn btn-block cat-continue-btn ${view()?.myContinueVote ? 'cat-voted' : ''}`}
                onClick={() => props.sendAction({ type: 'continue' })}
              >
                {view()?.myContinueVote ? 'Ready for Next Category' : 'Continue'}
              </button>
              <p class="muted cat-vote-tally">
                {view()?.continueCount}/{view()?.connectedCount} ready
              </p>
            </>
          }
        >
          <p class="muted cat-vote-hint">
            Go around until someone fails, then vote who failed.
          </p>
          <div class="cat-candidates">
            <For each={view()?.candidates ?? []}>
              {(candidate) => (
                <button
                  class={`btn btn-block btn-vote cat-candidate ${view()?.myVote === candidate.id ? 'cat-voted' : ''}`}
                  onClick={() =>
                    props.sendAction({ type: 'vote', payload: { targetId: candidate.id } })
                  }
                >
                  {candidate.name}
                </button>
              )}
            </For>
          </div>
          <p class="muted cat-vote-tally">
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
