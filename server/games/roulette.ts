import {
  SPIN_LEAD_MS,
  totalSpinDurationMs,
  type RouletteHostView,
  type RoulettePlayerEntry,
  type RoulettePlayerView,
  type RouletteSpinSchedule,
  type RouletteState,
} from '../../shared/games/roulette';
import type { GameContext, GameDefinition } from '../game';
import { connectedOrAllPlayers, playerName } from './helpers';

const MIN_STEPS = 54;
const MIN_LAPS = 6;

function startSpin(ctx: GameContext): RouletteState {
  const playerOrder = connectedOrAllPlayers(ctx).map((p) => p.id);
  if (playerOrder.length === 0) {
    ctx.clearTimer();
    return {
      phase: 'STOPPED',
      playerOrder: [],
      startIndex: 0,
      totalSteps: 0,
      spinStartAt: 0,
      selectedId: null,
    };
  }

  const startIndex = Math.floor(Math.random() * playerOrder.length);
  const totalSteps =
    Math.max(MIN_STEPS, playerOrder.length * MIN_LAPS) +
    Math.floor(Math.random() * playerOrder.length);
  const spinStartAt = Date.now() + SPIN_LEAD_MS;

  ctx.setTimer(SPIN_LEAD_MS + totalSpinDurationMs(totalSteps));

  return {
    phase: 'SPINNING',
    playerOrder,
    startIndex,
    totalSteps,
    spinStartAt,
    selectedId: null,
  };
}

function buildSpinSchedule(state: RouletteState): RouletteSpinSchedule | null {
  if (state.phase !== 'SPINNING' || state.playerOrder.length === 0) {
    return null;
  }
  return {
    spinStartAt: state.spinStartAt,
    serverNow: Date.now(),
    startIndex: state.startIndex,
    totalSteps: state.totalSteps,
    playerOrder: state.playerOrder,
  };
}

function maybeRespin(
  ctx: GameContext,
  state: RouletteState,
  action: { type: string }
): RouletteState {
  if (action.type === 'spin' && state.phase === 'STOPPED') {
    return startSpin(ctx);
  }
  return state;
}

export const rouletteGame: GameDefinition<
  RouletteState,
  RouletteHostView,
  RoulettePlayerView
> = {
  id: 'roulette',
  name: 'Roulette',
  description: 'Phones flash white around the room, slowing down until one is caught in red.',
  minPlayers: 2,
  maxPlayers: 12,

  onStart(ctx) {
    return startSpin(ctx);
  },

  onTimerExpired(ctx, state) {
    if (state.phase !== 'SPINNING' || state.playerOrder.length === 0) {
      return state;
    }

    const lastStep = Math.max(0, state.totalSteps - 1);
    const selectedIndex = (state.startIndex + lastStep) % state.playerOrder.length;
    const selectedId = state.playerOrder[selectedIndex] ?? null;
    ctx.clearTimer();
    ctx.broadcastEvent('roulette_stopped', { playerId: selectedId });
    return {
      ...state,
      phase: 'STOPPED',
      selectedId,
    };
  },

  onPlayerAction(ctx, state, _playerId, action) {
    return maybeRespin(ctx, state, action);
  },

  onHostAction(ctx, state, action) {
    return maybeRespin(ctx, state, action);
  },

  getHostView(state, ctx): RouletteHostView {
    const players: RoulettePlayerEntry[] = ctx.getPlayers().map((p) => ({
      id: p.id,
      name: p.name,
      isSelected: state.phase === 'STOPPED' && p.id === state.selectedId,
    }));

    return {
      phase: state.phase,
      players,
      selectedName: playerName(ctx, state.selectedId),
      spin: buildSpinSchedule(state),
    };
  },

  getPlayerView(state, playerId, ctx): RoulettePlayerView {
    return {
      phase: state.phase,
      playerId,
      isSelected: state.phase === 'STOPPED' && state.selectedId === playerId,
      selectedName: playerName(ctx, state.selectedId),
      spin: buildSpinSchedule(state),
    };
  },
};
