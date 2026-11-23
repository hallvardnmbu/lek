import { For, Show, createSignal } from 'solid-js';
import type { DrawHostView, DrawPlayerView } from '../../../../shared/games/draw';
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
            <div class="draw-tv-banner">
              <div class="draw-tv-round">Round {view().round}</div>

              <Show when={view().phase === 'PROMPTING'}>
                <h1 class="draw-tv-prompt">
                  {view().prompterName} is picking a prompt
                </h1>
              </Show>

              <Show when={view().phase === 'DRAWING'}>
                <h1 class="draw-tv-prompt">Draw: {view().prompt}</h1>
              </Show>

              <Show when={view().phase === 'VOTING'}>
                <h1 class="draw-tv-prompt">{view().prompt}</h1>
                <div class={`draw-vote-badge ${view().voteMode ?? 'best'}`}>
                  Vote for the {view().voteMode === 'worst' ? 'WORST' : 'BEST'} drawing!
                </div>
              </Show>

              <Show when={view().phase === 'RESULTS'}>
                <h1 class="draw-tv-prompt">{view().prompt}</h1>
                <div class={`draw-vote-badge ${view().voteMode ?? 'best'}`}>
                  {view().voteMode === 'worst' ? 'WORST' : 'BEST'} Drawing Results
                </div>
              </Show>
            </div>

            <Show when={view().phase === 'DRAWING'}>
              <div class="draw-tv-grid">
                <For each={view().entries}>
                  {(entry) => (
                    <div class="draw-tv-card">
                      <DrawingThumb
                        src={entry.imageData}
                        alt={entry.playerName}
                        placeholder="Drawing"
                        class="draw-tv-thumb"
                      />
                      <div class="draw-tv-card-footer">
                        <span>{entry.playerName}</span>
                        <Show when={entry.submitted}>
                          <span class="draw-tag">Done</span>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <Show when={view().phase === 'VOTING'}>
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

              <div class="status-pills-grid">
                <For each={props.state.players}>
                  {(p) => {
                    const voted = () => view().votedPlayerIds.includes(p.id);
                    return (
                      <div class={`status-pill ${voted() ? 'done' : ''}`}>
                        <span>{p.name}</span>
                        <span>{voted() ? 'Voted' : 'Voting'}</span>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>

            <Show when={view().phase === 'RESULTS'}>
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
                        <span class={`draw-tag ${res.isWinner ? 'winner' : ''}`}>
                          {res.votes} {res.votes === 1 ? 'vote' : 'votes'}
                          {res.isWinner ? ' · +100' : ''}
                        </span>
                      </div>
                    </div>
                  )}
                </For>
              </div>

              <div class="tv-action-bar">
                <button class="btn btn-tv" onClick={() => props.sendAction({ type: 'next_round' })}>
                  Next Round
                </button>
                <button class="btn btn-tv" onClick={props.endGame}>
                  End Game
                </button>
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
                fallback={<p class="muted">Submitted. Waiting for others.</p>}
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
                Vote for the {view().voteMode === 'worst' ? 'WORST' : 'BEST'} drawing!
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
            </Show>

            <Show when={view().phase === 'RESULTS'}>
              <h2>Round {view().round} Results</h2>
              <p class="muted">
                {view().voteMode === 'worst' ? 'Worst' : 'Best'} drawing of "{view().prompt}"
              </p>
              <Show when={view().results.find((r) => r.playerId === props.playerId)}>
                {(mine) => (
                  <p>
                    {mine().isWinner
                      ? 'You won this round! +100 pts'
                      : `You got ${mine().votes} ${mine().votes === 1 ? 'vote' : 'votes'}.`}
                  </p>
                )}
              </Show>
              <div class="draw-mobile-actions">
                <button
                  type="button"
                  class="btn"
                  onClick={() => props.sendAction({ type: 'next_round' })}
                >
                  Next Round
                </button>
                <button
                  type="button"
                  class="btn"
                  onClick={() => props.sendAction({ type: 'finish_game' })}
                >
                  End Game
                </button>
              </div>
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
