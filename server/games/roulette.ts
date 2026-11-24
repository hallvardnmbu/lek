import {
  SPIN_LEAD_MS,
  STOPPED_HOLD_MS,
  totalSpinDurationMs,
  type RouletteHostView,
  type RoulettePhase,
  type RoulettePlayerEntry,
  type RoulettePlayerView,
  type RouletteSpinSchedule,
} from '../../shared/games/roulette';
import type { GameContext, GameDefinition } from '../game';
import { awardCappedScore, connectedOrAllPlayers, playerName } from './helpers';

export { STOPPED_HOLD_MS };

export interface RouletteState {
  phase: RoulettePhase;
  playerOrder: string[];
  startIndex: number;
  totalSteps: number;
  spinStartAt: number;
  selectedId: string | null;
}

const MIN_STEPS = 54;
const MIN_LAPS = 6;
const LOSER_POINTS = 1;

function startSpin(ctx: GameContext): RouletteState {
  const playerOrder = connectedOrAllPlayers(ctx).map((p) => p.id);
  if (playerOrder.length === 0) {
    ctx.clearTimer();
    ctx.endGame();
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
    if (state.phase === 'STOPPED') {
      ctx.clearTimer();
      ctx.endGame();
      return state;
    }
    if (state.phase !== 'SPINNING' || state.playerOrder.length === 0) {
      return state;
    }

    const lastStep = Math.max(0, state.totalSteps - 1);
    const selectedIndex = (state.startIndex + lastStep) % state.playerOrder.length;
    const selectedId = state.playerOrder[selectedIndex] ?? null;
    if (selectedId) {
      awardCappedScore(ctx, selectedId, LOSER_POINTS);
    }
    ctx.broadcastEvent('roulette_stopped', { playerId: selectedId });
    ctx.setTimer(STOPPED_HOLD_MS, false);
    return {
      ...state,
      phase: 'STOPPED',
      selectedId,
    };
  },

  onPlayerAction(_ctx, state) {
    return state;
  },

  onPlayerLeave(ctx, state, playerId) {
    const playerOrder = state.playerOrder.filter((id) => id !== playerId);
    const selectedId = state.selectedId === playerId ? null : state.selectedId;
    if (playerOrder.length === 0) {
      ctx.clearTimer();
      ctx.endGame();
      return {
        ...state,
        phase: 'STOPPED',
        playerOrder,
        selectedId,
      };
    }
    return {
      ...state,
      playerOrder,
      startIndex: state.startIndex % playerOrder.length,
      selectedId,
    };
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
