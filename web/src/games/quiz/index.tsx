import { For, Show } from 'solid-js';
import type { QuizHostView, QuizPlayerView } from '../../../../shared/games/quiz';
import type { GameUiDefinition, MobileGameViewProps, TvGameViewProps } from '../registry';
import './quiz.css';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

function QuizTvView(props: TvGameViewProps<QuizHostView>) {
  const host = () => props.state.hostState;
  const eliminated = () => (host()?.results ?? []).filter((r) => r.eliminated);

  return (
    <div class="tv-phase-center">
      <Show
        when={host()?.phase !== 'GENERATING'}
        fallback={
          <div class="qz-generating">
            <div class="spinner" />
            <h1 class="tv-hero-title">Quiz</h1>
            <p class="tv-hero-sub">The AI is writing Norwegian questions…</p>
          </div>
        }
      >
        <p class="eyebrow">
          QUESTION {host()?.questionNumber} · {host()?.aliveCount} STILL IN
        </p>

        <h1 class="qz-question">{host()?.question}</h1>

        <div class="qz-options">
          <For each={host()?.options ?? []}>
            {(option, idx) => (
              <div
                class={`qz-option ${
                  host()?.phase === 'REVEAL' && host()?.correctIndex === idx()
                    ? 'qz-option-correct'
                    : ''
                }`}
              >
                <span class="qz-option-letter">{OPTION_LETTERS[idx()]}</span>
                <span class="qz-option-text">{option}</span>
              </div>
            )}
          </For>
        </div>

        <Show
          when={host()?.phase === 'QUESTION'}
          fallback={
            <div class="qz-reveal">
              <For each={eliminated()}>
                {(entry) => (
                  <p class="qz-out-name">OUT: {entry.playerName}</p>
                )}
              </For>
              <Show when={host()?.allWrong}>
                <p class="qz-all-wrong">All wrong — nobody is out!</p>
              </Show>
              <Show when={host()?.winnerName}>
                <p class="qz-winner">WINNER: {host()?.winnerName}</p>
              </Show>
            </div>
          }
        >
          <p class="qz-progress">
            {host()?.answeredCount}/{host()?.connectedAliveCount} answered
          </p>
        </Show>

        <div class="tv-action-bar qz-tv-actions">
          <button class="btn btn-tv" onClick={() => props.sendAction({ type: 'next' })}>
            {host()?.phase === 'QUESTION' ? 'Reveal Now' : 'Next Question'}
          </button>
          <button class="btn btn-tv" onClick={props.endGame}>
            End Game
          </button>
        </div>
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
        fallback={<p class="muted qz-waiting">Writing questions… hold tight.</p>}
      >
        <h2 class="qz-mobile-question">{view()?.question}</h2>

        <Show
          when={view()?.phase === 'QUESTION'}
          fallback={
            <>
              <Show when={view()?.iAmAlive} fallback={<p class="muted">You're out — spectating.</p>}>
                <Show
                  when={view()?.myCorrect === true}
                  fallback={
                    <p class={view()?.iWasEliminated ? 'qz-result-out' : 'qz-result-safe'}>
                      {view()?.iWasEliminated
                        ? 'Wrong — you are out!'
                        : view()?.allWrong
                          ? 'Everyone wrong — nobody is out!'
                          : 'You missed this one — still in.'}
                    </p>
                  }
                >
                  <p class="qz-result-safe">Correct — you are still in!</p>
                </Show>
              </Show>
              <p class="qz-correct-answer">Answer: {correctAnswerText()}</p>
              <Show when={view()?.winnerName}>
                <p class="qz-winner">WINNER: {view()?.winnerName}</p>
              </Show>
            </>
          }
        >
          <Show when={view()?.iAmAlive} fallback={<p class="muted">You're out — spectating.</p>}>
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
