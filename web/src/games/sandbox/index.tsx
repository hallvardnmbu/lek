import { For, Show } from 'solid-js';
import type { SandboxGameState, SandboxPlayerView } from '../../../../shared/games/sandbox';
import type { GameUiDefinition, MobileGameViewProps, TvGameViewProps } from '../registry';
import './sandbox.css';

function SandboxTvView(props: TvGameViewProps<SandboxGameState>) {
  const hostState = () => props.state.hostState;

  return (
    <div class="tv-phase-center">
      <h1 class="tv-hero-title">Sandbox</h1>

      <div class="sandbox-tv-card">
        <div class="sandbox-stat">Actions: {hostState()?.actionCount ?? 0}</div>
        <Show
          when={hostState()?.lastAction}
          fallback={<div class="sandbox-last-action">Tap a button on any phone to test.</div>}
        >
          {(act) => (
            <div class="sandbox-last-action">
              Last action: <strong>{act().type}</strong> by {act().actorId}
            </div>
          )}
        </Show>
      </div>

      <div class="status-pills-grid">
        <For each={props.state.players}>
          {(p) => (
            <div class={`status-pill ${p.connected ? 'done' : ''}`}>
              <span>{p.name}</span>
              <span>{p.score} pts</span>
            </div>
          )}
        </For>
      </div>

      <div class="tv-action-bar">
        <button class="btn" onClick={props.endGame}>
          End Game
        </button>
      </div>
    </div>
  );
}

function SandboxMobileView(props: MobileGameViewProps<SandboxPlayerView>) {
  const playerState = () => props.state.playerState;

  return (
    <div class="mobile-card">
      <h2>Sandbox</h2>
      <p class="muted">
        Actions: <strong>{playerState()?.actionCount ?? 0}</strong>
      </p>

      <button
        class="btn btn-block"
        onClick={() => props.sendAction({ type: 'ping_action', payload: { ts: Date.now() } })}
      >
        Send Test Action
      </button>
    </div>
  );
}

export const sandboxGameUi: GameUiDefinition<SandboxGameState, SandboxPlayerView> = {
  id: 'sandbox',
  name: 'Sandbox',
  TvView: SandboxTvView,
  MobileView: SandboxMobileView,
};
