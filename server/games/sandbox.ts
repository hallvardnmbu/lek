import type { SandboxGameState, SandboxPlayerView } from '../../shared/games/sandbox';
import type { GameDefinition } from '../game';

/**
 * Minimal built-in fallback game so the TV + Phone foundation works out-of-the-box
 * for connection testing and as a reference template.
 */
export const sandboxGame: GameDefinition<
  SandboxGameState,
  SandboxGameState,
  SandboxPlayerView
> = {
  id: 'sandbox',
  name: 'Sandbox',
  description: 'Minimal foundation template for testing TV & phone connectivity.',
  minPlayers: 1,
  maxPlayers: 12,

  onStart() {
    return {
      startedAt: Date.now(),
      lastAction: null,
      actionCount: 0,
    };
  },

  onPlayerAction(ctx, state, playerId, action) {
    const player = ctx.getPlayer(playerId);
    const next: SandboxGameState = {
      ...state,
      actionCount: state.actionCount + 1,
      lastAction: {
        actorId: player?.name ?? playerId,
        type: action.type,
        payload: action.payload,
        at: Date.now(),
      },
    };
    ctx.broadcastEvent('action_echo', next.lastAction);
    return next;
  },

  onHostAction(_ctx, state, action) {
    return {
      ...state,
      actionCount: state.actionCount + 1,
      lastAction: {
        actorId: 'TV_HOST',
        type: action.type,
        payload: action.payload,
        at: Date.now(),
      },
    };
  },

  onExternalEvent(ctx, state, event, payload) {
    ctx.broadcastEvent(event, payload);
    return state;
  },

  getHostView(state) {
    return state;
  },

  getPlayerView(state, playerId, ctx) {
    return {
      myScore: ctx.getPlayer(playerId)?.score ?? 0,
      actionCount: state.actionCount,
      lastActionType: state.lastAction?.type ?? null,
    };
  },
};
