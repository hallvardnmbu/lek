import { For, Show, createSignal } from 'solid-js';
import type { DrawHostView, DrawPlayerView } from '../../../../shared/games/draw';
import { TvActedArms } from '../../components/tv/TvActedArms';
import type { GameUiDefinition, MobileGameViewProps, TvGameViewProps } from '../registry';
import { DrawCanvas } from './DrawCanvas';
import './draw.css';

function DrawingThumb(props: { src: string; alt: string; placeholder: string; class?: string }) {
  return (
    <Show
      when={props.src}
      fallback={<div class="draw-tv-placeholder">{props.placeholder}</div>}
    >
      {(src) => <img class={props.class} src={src()} alt={props.alt} />}
    </Show>
  );
}

function DrawTvView(props: TvGameViewProps<DrawHostView>) {
  const hs = () => props.state.hostState;

  return (
    <div class="draw-tv-wrap">
      <Show when={hs()}>
        {(view) => (
          <>
            <Show when={view().phase === 'PROMPTING'}>
              <div class="tv-phase-center">
                <div class="eyebrow">DRAW</div>
                <h1 class="tv-hero-title">
                  {view().prompterName} is picking a prompt
                </h1>
              </div>
            </Show>

            <Show when={view().phase === 'DRAWING'}>
              <div class="draw-tv-banner">
                <div class="eyebrow">DRAW THIS PROMPT</div>
                <h1 class="draw-tv-title">{view().prompt}</h1>
              </div>

              <div class="draw-tv-grid">
                <For each={view().entries}>
                  {(entry) => (
                    <div class={`draw-tv-card ${entry.submitted ? 'is-submitted' : ''}`}>
                      <DrawingThumb
                        src={entry.imageData}
                        alt={entry.playerName}
                        placeholder="Drawing"
                        class="draw-tv-thumb"
                      />
                      <div class="draw-tv-card-footer">
                        <span>{entry.playerName}</span>
                        <Show when={entry.submitted}>
                          <span class="status-badge badge-accent">DONE</span>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </div>

              <TvActedArms
                players={props.state.players}
                actedIds={view().entries.filter((e) => e.submitted).map((e) => e.playerId)}
              />
            </Show>

            <Show when={view().phase === 'VOTING'}>
              <div class="draw-tv-banner">
                <h1 class="draw-tv-vote-title">
                  Vote for the {view().voteMode === 'worst' ? 'WORST' : 'BEST'} drawing
                </h1>
                <p class="draw-tv-subtitle">Prompt: {view().prompt}</p>
              </div>

              <div class="draw-tv-grid">
                <For each={view().entries}>
                  {(entry, idx) => (
                    <div class="draw-tv-card">
                      <DrawingThumb
                        src={entry.imageData}
                        alt={`Drawing ${idx() + 1}`}
                        placeholder="Blank"
                        class="draw-tv-thumb"
                      />
                      <div class="draw-tv-card-footer">
                        <span>Drawing #{idx() + 1}</span>
                      </div>
                    </div>
                  )}
                </For>
              </div>

              <TvActedArms players={props.state.players} actedIds={view().votedPlayerIds} />
            </Show>

            <Show when={view().phase === 'RESULTS'}>
              <div class="draw-tv-banner">
                <div class="eyebrow">
                  {view().voteMode === 'worst' ? 'WORST DRAWING' : 'BEST DRAWING'}
                </div>
                <h1 class="draw-tv-title">{view().prompt}</h1>
              </div>

              <div class="draw-tv-grid">
                <For each={view().results}>
                  {(res) => (
                    <div class={`draw-tv-card ${res.isWinner ? 'winner' : ''}`}>
                      <DrawingThumb
                        src={res.imageData}
                        alt={res.playerName}
                        placeholder="Blank"
                        class="draw-tv-thumb"
                      />
                      <div class="draw-tv-card-footer">
                        <span>{res.playerName}</span>
                        <span class={`status-badge ${res.isWinner ? 'badge-accent' : 'badge-muted'}`}>
                          {res.votes} {res.votes === 1 ? 'vote' : 'votes'}
                          {res.isWinner ? ' · +2 pts' : ''}
                        </span>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}

function DrawMobileView(props: MobileGameViewProps<DrawPlayerView>) {
  const [promptInput, setPromptInput] = createSignal('');
  const ps = () => props.state.playerState;

  const handleSubmitPrompt = (e: Event) => {
    e.preventDefault();
    const text = promptInput().trim();
    if (!text) return;
    props.sendAction({ type: 'submit_prompt', payload: { text } });
    setPromptInput('');
  };

  return (
    <div class="mobile-card">
      <Show when={ps()}>
        {(view) => (
          <>
            <Show when={view().phase === 'PROMPTING'}>
              <Show
                when={view().isPrompter}
                fallback={
                  <>
                    <h2>Get Ready!</h2>
                    <p class="muted">
                      Waiting for <strong>{view().prompterName}</strong>
                    </p>
                  </>
                }
              >
                <h2>Pick Something to Draw</h2>
                <p class="muted">Everyone will draw what you type.</p>
                <form class="answer-form" onSubmit={handleSubmitPrompt}>
                  <label class="field">
                    <input
                      type="text"
                      maxlength={60}
                      placeholder="e.g. A cat riding a skateboard"
                      value={promptInput()}
                      onInput={(e) => setPromptInput(e.currentTarget.value)}
                      required
                    />
                  </label>
                  <button class="btn" type="submit" disabled={!promptInput().trim()}>
                    Start Drawing
                  </button>
                </form>
              </Show>
            </Show>

            <Show when={view().phase === 'DRAWING'}>
              <div class="draw-mobile-prompt-box">{view().prompt}</div>
              <Show
                when={!view().hasSubmitted}
                fallback={
                  <div class="draw-mobile-submitted">
                    <p class="draw-mobile-submitted-title">Submitted!</p>
                    <Show when={view().myDrawingData}>
                      {(src) => (
                        <img
                          class="draw-mobile-submitted-thumb"
                          src={src()}
                          alt="Your drawing"
                        />
                      )}
                    </Show>
                    <p class="muted">Waiting for others</p>
                  </div>
                }
              >
                <DrawCanvas
                  onSync={(imageData) =>
                    props.sendAction({ type: 'sync_drawing', payload: { imageData } })
                  }
                  onSubmit={(imageData) =>
                    props.sendAction({ type: 'submit_drawing', payload: { imageData } })
                  }
                />
              </Show>
            </Show>

            <Show when={view().phase === 'VOTING'}>
              <h2>
                Vote for the {view().voteMode === 'worst' ? 'WORST' : 'BEST'} drawing
              </h2>
              <p class="muted">Prompt: {view().prompt}</p>
              <div class="draw-mobile-vote-grid">
                <For each={view().votableEntries}>
                  {(entry, idx) => (
                    <button
                      type="button"
                      class={`draw-vote-option ${
                        view().votedForId === entry.playerId ? 'selected' : ''
                      }`}
                      onClick={() =>
                        props.sendAction({
                          type: 'cast_vote',
                          payload: { targetPlayerId: entry.playerId },
                        })
                      }
                    >
                      <DrawingThumb
                        src={entry.imageData}
                        alt={`Option ${idx() + 1}`}
                        placeholder="Blank"
                      />
                      <span>#{idx() + 1}</span>
                    </button>
                  )}
                </For>
              </div>
              <Show when={view().hasVoted}>
                <p class="vote-tally-note muted">Vote locked in — waiting for others</p>
              </Show>
            </Show>

            <Show when={view().phase === 'RESULTS'}>
              <div class="eyebrow">
                {view().voteMode === 'worst' ? 'WORST DRAWING' : 'BEST DRAWING'}
              </div>
              <h2>{view().prompt}</h2>
              <Show when={view().results.find((r) => r.playerId === props.playerId)}>
                {(mine) => (
                  <div class={`draw-mobile-result ${mine().isWinner ? 'is-winner' : ''}`}>
                    <p class="draw-mobile-result-title">
                      {mine().isWinner ? 'You won!' : 'Results'}
                    </p>
                    <div class="draw-mobile-result-badges">
                      <span class="status-badge badge-muted">
                        {mine().votes} {mine().votes === 1 ? 'vote' : 'votes'}
                      </span>
                      <Show when={mine().isWinner}>
                        <span class="status-badge badge-accent">+2 pts</span>
                      </Show>
                    </div>
                  </div>
                )}
              </Show>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}

export const drawGameUi: GameUiDefinition<DrawHostView, DrawPlayerView> = {
  id: 'draw',
  name: 'Draw',
  TvView: DrawTvView,
  MobileView: DrawMobileView,
};
