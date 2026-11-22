import type {
  RouletteHostView,
  RoulettePlayerEntry,
  RoulettePlayerView,
  RouletteState,
} from '../../shared/games/roulette';
import type { GameContext, GameDefinition } from '../game';

const TOTAL_SPIN_MS = 20_000;
const WEIGHT_GROWTH = 18;
const WEIGHT_POWER = 2.5;
const MIN_STEPS = 54;
const MIN_LAPS = 6;

function stepWeight(step: number, totalSteps: number): number {
  if (totalSteps <= 1) return 1;
  const progress = Math.min(1, Math.max(0, step / (totalSteps - 1)));
  return 1 + WEIGHT_GROWTH * Math.pow(progress, WEIGHT_POWER);
}

export function computeStepDelayMs(step: number, totalSteps: number): number {
  if (totalSteps <= 0) return TOTAL_SPIN_MS;
  let totalWeight = 0;
  for (let i = 0; i < totalSteps; i++) {
    totalWeight += stepWeight(i, totalSteps);
  }
  return Math.max(50, Math.round((TOTAL_SPIN_MS * stepWeight(step, totalSteps)) / totalWeight));
}

function getSpinPool(ctx: GameContext): string[] {
  const connected = ctx.getPlayers().filter((p) => p.connected);
  const pool = connected.length > 0 ? connected : ctx.getPlayers();
  return pool.map((p) => p.id);
}

function startSpin(ctx: GameContext): RouletteState {
  const playerOrder = getSpinPool(ctx);
  if (playerOrder.length === 0) {
    ctx.clearTimer();
    return {
      phase: 'STOPPED',
      playerOrder: [],
      activeIndex: 0,
      step: 0,
      totalSteps: 0,
      selectedId: null,
    };
  }

  const activeIndex = Math.floor(Math.random() * playerOrder.length);
  const totalSteps =
    Math.max(MIN_STEPS, playerOrder.length * MIN_LAPS) +
    Math.floor(Math.random() * playerOrder.length);

  ctx.setTimer(computeStepDelayMs(0, totalSteps));

  return {
    phase: 'SPINNING',
    playerOrder,
    activeIndex,
    step: 0,
    totalSteps,
    selectedId: null,
  };
}

function activePlayerId(state: RouletteState): string | null {
  if (state.playerOrder.length === 0) return null;
  return state.playerOrder[state.activeIndex % state.playerOrder.length] ?? null;
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

    const nextStep = state.step + 1;
    if (nextStep >= state.totalSteps) {
      const selectedId = activePlayerId(state);
      ctx.clearTimer();
      ctx.broadcastEvent('roulette_stopped', { playerId: selectedId });
      return {
        ...state,
        phase: 'STOPPED',
        step: nextStep,
        selectedId,
      };
    }

    const nextIndex = (state.activeIndex + 1) % state.playerOrder.length;
    ctx.setTimer(computeStepDelayMs(nextStep, state.totalSteps));
    return {
      ...state,
      activeIndex: nextIndex,
      step: nextStep,
    };
  },

  onPlayerAction(ctx, state, _playerId, action) {
    if (action.type === 'spin' && state.phase === 'STOPPED') {
      return startSpin(ctx);
    }
    return state;
  },

  onHostAction(ctx, state, action) {
    if (action.type === 'spin' && state.phase === 'STOPPED') {
      return startSpin(ctx);
    }
    return state;
  },

  getHostView(state, ctx): RouletteHostView {
    const currentId = activePlayerId(state);
    const players: RoulettePlayerEntry[] = ctx.getPlayers().map((p) => ({
      id: p.id,
      name: p.name,
      isActive: state.phase === 'SPINNING' && p.id === currentId,
      isSelected: state.phase === 'STOPPED' && p.id === state.selectedId,
    }));
    const selectedName =
      state.selectedId ? (ctx.getPlayer(state.selectedId)?.name ?? null) : null;

    return {
      phase: state.phase,
      players,
      selectedName,
    };
  },

  getPlayerView(state, playerId, ctx): RoulettePlayerView {
    const currentId = activePlayerId(state);
    const selectedName =
      state.selectedId ? (ctx.getPlayer(state.selectedId)?.name ?? null) : null;

    return {
      phase: state.phase,
      isActive: state.phase === 'SPINNING' && currentId === playerId,
      isSelected: state.phase === 'STOPPED' && state.selectedId === playerId,
      selectedName,
    };
  },
};
