import { For, Show, createMemo } from 'solid-js';
import type { QuizHostView, QuizPlayerView } from '../../../../shared/games/quiz';
import { ResultList, type ResultListEntry } from '../../components/ResultList';
import { TvActedArms } from '../../components/tv/TvActedArms';
import type { GameUiDefinition, MobileGameViewProps, TvGameViewProps } from '../registry';
import './quiz.css';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

function QuizTvView(props: TvGameViewProps<QuizHostView>) {
  const host = () => props.state.hostState;

  const scoresById = createMemo(
    () => new Map(props.state.players.map((p) => [p.id, p.score]))
  );

  const scoreboardEntries = createMemo<ResultListEntry[]>(() =>
    (host()?.results ?? []).map((entry) => {
      const playerScore = scoresById().get(entry.playerId) ?? 0;
      return {
        playerId: entry.playerId,
        name: entry.playerName,
        tone: entry.eliminated ? 'loser' : entry.correct ? 'accent' : 'default',
        badge: entry.eliminated ? 'OUT' : entry.correct ? 'CORRECT' : 'SAFE',
        badgeTone: entry.eliminated ? 'loser' : entry.correct ? 'accent' : 'muted',
        stat: `${playerScore} pts`,
      };
    })
  );

  return (
    <div class="tv-phase-center">
      <Show
        when={host()?.phase !== 'GENERATING'}
        fallback={
          <div class="qz-generating">
            <div class="spinner" />
            <h1 class="tv-hero-title">Quiz</h1>
            <p class="tv-hero-sub">Writing questions</p>
          </div>
        }
      >
        <p class="eyebrow">
          Q{host()?.questionNumber}, {host()?.aliveCount} LEFT
        </p>

        <h1 class="qz-question">{host()?.question}</h1>

        <div class="qz-options">
          <For each={host()?.options ?? []}>
            {(option, idx) => {
              const stateClass = () => {
                if (host()?.phase !== 'REVEAL') return '';
                return host()?.correctIndex === idx()
                  ? 'qz-option-correct'
                  : 'qz-option-wrong';
              };

              return (
                <div class={`qz-option ${stateClass()}`}>
                  <span class="qz-option-letter">{OPTION_LETTERS[idx()]}</span>
                  <span class="qz-option-text">{option}</span>
                </div>
              );
            }}
          </For>
        </div>

        <Show
          when={host()?.phase === 'QUESTION'}
          fallback={
            <div class="qz-reveal">
              <Show when={host()?.allWrong}>
                <p class="qz-all-wrong">All wrong. Nobody out.</p>
              </Show>
              <Show when={host()?.winnerName}>
                {(name) => (
                  <div class="qz-winner">
                    <span class="status-badge badge-accent">WINNER</span>
                    <span>{name()}</span>
                  </div>
                )}
              </Show>
              <ResultList
                players={props.state.players}
                entries={scoreboardEntries()}
                class="qz-scoreboard"
              />
            </div>
          }
        >
          <TvActedArms players={props.state.players} actedIds={host()?.answeredPlayerIds ?? []} />
        </Show>
      </Show>
    </div>
  );
}

function QuizMobileView(props: MobileGameViewProps<QuizPlayerView>) {
  const view = () => props.state.playerState;
  const correctAnswerText = () => {
    const idx = view()?.correctIndex;
    return idx === null || idx === undefined ? '' : (view()?.options[idx] ?? '');
  };

  return (
    <div class="mobile-card qz-mobile">
      <div class="qz-mobile-head">
        <span>Question {view()?.questionNumber}</span>
        <span class="qz-alive-count">{view()?.aliveCount} still in</span>
      </div>

      <Show
        when={view()?.phase !== 'GENERATING'}
        fallback={<p class="muted qz-waiting">Writing questions</p>}
      >
        <h2 class="qz-mobile-question">{view()?.question}</h2>

        <Show
          when={view()?.phase === 'QUESTION'}
          fallback={
            <>
              <Show when={view()?.iAmAlive} fallback={<p class="muted">Eliminated</p>}>
                <Show
                  when={view()?.myCorrect === true}
                  fallback={
                    <p class={view()?.iWasEliminated ? 'qz-result-out' : 'qz-result-safe'}>
                      {view()?.iWasEliminated
                        ? 'Wrong. You are out.'
                        : view()?.allWrong
                          ? 'All wrong. Still in.'
                          : 'Missed. Still in.'}
                    </p>
                  }
                >
                  <p class="qz-result-safe">Correct. Still in.</p>
                </Show>
              </Show>
              <p class="qz-correct-answer">Answer: {correctAnswerText()}</p>
              <Show when={view()?.winnerName}>
                {(name) => (
                  <div class="qz-winner qz-winner-mobile">
                    <span class="status-badge badge-accent">WINNER</span>
                    <span>{name()}</span>
                  </div>
                )}
              </Show>
            </>
          }
        >
          <Show when={view()?.iAmAlive} fallback={<p class="muted">Eliminated</p>}>
            <div class="qz-answers">
              <For each={view()?.options ?? []}>
                {(option, idx) => (
                  <button
                    class={`btn btn-block btn-vote qz-answer ${
                      view()?.myAnswerIndex === idx() ? 'qz-selected' : ''
                    }`}
                    disabled={view()?.myAnswerIndex !== null && view()?.myAnswerIndex !== undefined}
                    onClick={() =>
                      props.sendAction({ type: 'answer', payload: { optionIndex: idx() } })
                    }
                  >
                    <span class="qz-answer-letter">{OPTION_LETTERS[idx()]}</span>
                    {option}
                  </button>
                )}
              </For>
            </div>
            <p class="muted qz-answer-tally">
              {view()?.answeredCount}/{view()?.connectedAliveCount} answered
            </p>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

export const quizGameUi: GameUiDefinition<QuizHostView, QuizPlayerView> = {
  id: 'quiz',
  name: 'Quiz',
  TvView: QuizTvView,
  MobileView: QuizMobileView,
};
