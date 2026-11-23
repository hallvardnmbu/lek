import type {
  DrawAction,
  DrawEntry,
  DrawHostView,
  DrawPhase,
  DrawPlayerView,
  DrawVoteMode,
  DrawVoteResult,
} from '../../shared/games/draw';
import type { GameContext, GameDefinition } from '../game';
import {
  awardCappedScore,
  buildVoteTally,
  connectedOrAllPlayers,
  connectedPlayers,
  withoutKey,
} from './helpers';

const PROMPT_DURATION_MS = 45_000;
export const DRAW_DURATION_MS = 90_000;
const VOTE_DURATION_MS = 30_000;
const MAX_PROMPT_LENGTH = 60;
const MAX_IMAGE_DATA_LENGTH = 200_000;
const WIN_POINTS = 2;

const FALLBACK_PROMPTS = [
  'A cat riding a skateboard',
  'An alien eating pizza',
  'A robot walking a dog',
  'A penguin at the beach',
  'A wizard making coffee',
];

interface DrawGameState {
  round: number;
  phase: DrawPhase;
  prompterId: string;
  prompt: string | null;
  voteMode: DrawVoteMode | null;
  drawings: Record<string, string>;
  submittedIds: string[];
  votes: Record<string, string>;
  results: DrawVoteResult[];
}

function pickRandomPrompter(ctx: GameContext, excludeId?: string): string {
  const pool = connectedOrAllPlayers(ctx);
  const candidates = excludeId && pool.length > 1 ? pool.filter((p) => p.id !== excludeId) : pool;
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return chosen?.id ?? '';
}

function sanitizeImageData(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('data:image/')) return null;
  if (raw.length > MAX_IMAGE_DATA_LENGTH) return null;
  return raw;
}

function startPromptPhase(ctx: GameContext, round: number, excludePrompterId?: string): DrawGameState {
  const prompterId = pickRandomPrompter(ctx, excludePrompterId);
  ctx.setTimer(PROMPT_DURATION_MS);
  return {
    round,
    phase: 'PROMPTING',
    prompterId,
    prompt: null,
    voteMode: null,
    drawings: {},
    submittedIds: [],
    votes: {},
    results: [],
  };
}

function startDrawingPhase(ctx: GameContext, state: DrawGameState, prompt: string): DrawGameState {
  ctx.setTimer(DRAW_DURATION_MS);
  return {
    ...state,
    phase: 'DRAWING',
    prompt,
    drawings: {},
    submittedIds: [],
    votes: {},
    results: [],
  };
}

function buildEntries(state: DrawGameState, ctx: GameContext): DrawEntry[] {
  return ctx.getPlayers().map((p) => ({
    playerId: p.id,
    playerName: p.name,
    imageData: state.drawings[p.id] ?? '',
    submitted: state.submittedIds.includes(p.id),
  }));
}

function startVotingPhase(ctx: GameContext, state: DrawGameState): DrawGameState {
  const voteMode: DrawVoteMode = Math.random() < 0.5 ? 'best' : 'worst';
  ctx.setTimer(VOTE_DURATION_MS);
  return {
    ...state,
    phase: 'VOTING',
    voteMode,
    votes: {},
    results: [],
  };
}

function tallyResults(ctx: GameContext, state: DrawGameState): DrawGameState {
  ctx.clearTimer();
  const tally = buildVoteTally(ctx, state.votes);
  const maxVotes = tally[0]?.votes ?? 0;

  const results: DrawVoteResult[] = tally.map((entry) => {
    const isWinner = maxVotes > 0 && entry.votes === maxVotes;
    if (isWinner) {
      awardCappedScore(ctx, entry.playerId, WIN_POINTS);
    }
    return {
      playerId: entry.playerId,
      playerName: entry.name,
      imageData: state.drawings[entry.playerId] ?? '',
      votes: entry.votes,
      isWinner,
    };
  });

  return {
    ...state,
    phase: 'RESULTS',
    results,
  };
}

function allConnectedDone(
  ctx: GameContext,
  done: (playerId: string) => boolean,
  excludeId?: string
): boolean {
  const active = connectedOrAllPlayers(ctx).filter((p) => p.id !== excludeId);
  return active.length > 0 && active.every((p) => done(p.id));
}

function handleRoundControl(
  ctx: GameContext,
  state: DrawGameState,
  action: DrawAction
): DrawGameState {
  if (state.phase !== 'RESULTS') return state;
  if (action.type === 'next_round') {
    return startPromptPhase(ctx, state.round + 1, state.prompterId);
  }
  if (action.type === 'finish_game') {
    ctx.endGame();
  }
  return state;
}

function handlePlayerExit(
  ctx: GameContext,
  state: DrawGameState,
  playerId: string
): DrawGameState {
  if (state.phase === 'PROMPTING' && state.prompterId === playerId) {
    const remaining = connectedPlayers(ctx).filter((p) => p.id !== playerId);
    if (remaining.length === 0) {
      ctx.endGame();
      return state;
    }
    const nextPrompterId = remaining[Math.floor(Math.random() * remaining.length)].id;
    return { ...state, prompterId: nextPrompterId };
  }
  if (state.phase === 'DRAWING' && allConnectedDone(ctx, (id) => state.submittedIds.includes(id), playerId)) {
    return startVotingPhase(ctx, state);
  }
  if (state.phase === 'VOTING' && allConnectedDone(ctx, (id) => Boolean(state.votes[id]), playerId)) {
    return tallyResults(ctx, state);
  }
  return state;
}

export const drawGame: GameDefinition<DrawGameState, DrawHostView, DrawPlayerView, DrawAction> = {
  id: 'draw',
  name: 'Draw',
  description: 'One player picks a prompt, everyone draws, then vote for the best or worst!',
  minPlayers: 2,
  maxPlayers: 12,

  onStart(ctx) {
    return startPromptPhase(ctx, 1);
  },

  onPlayerAction(ctx, state, playerId, action) {
    if (action.type === 'submit_prompt' && state.phase === 'PROMPTING') {
      if (playerId !== state.prompterId) return state;
      const text = typeof action.payload?.text === 'string'
        ? action.payload.text.trim().slice(0, MAX_PROMPT_LENGTH)
        : '';
      if (!text) return state;
      return startDrawingPhase(ctx, state, text);
    }

    if (action.type === 'sync_drawing' && state.phase === 'DRAWING') {
      const imageData = sanitizeImageData(action.payload?.imageData);
      if (!imageData) return state;
      return {
        ...state,
        drawings: { ...state.drawings, [playerId]: imageData },
      };
    }

    if (action.type === 'submit_drawing' && state.phase === 'DRAWING') {
      const imageData = sanitizeImageData(action.payload?.imageData);
      const nextDrawings = imageData
        ? { ...state.drawings, [playerId]: imageData }
        : state.drawings;
      const nextSubmitted = state.submittedIds.includes(playerId)
        ? state.submittedIds
        : [...state.submittedIds, playerId];
      const nextState: DrawGameState = {
        ...state,
        drawings: nextDrawings,
        submittedIds: nextSubmitted,
      };
      if (allConnectedDone(ctx, (id) => nextSubmitted.includes(id))) {
        return startVotingPhase(ctx, nextState);
      }
      return nextState;
    }

    if (action.type === 'cast_vote' && state.phase === 'VOTING') {
      const targetId = action.payload?.targetPlayerId;
      if (typeof targetId !== 'string' || targetId === playerId) return state;
      if (!ctx.getPlayer(targetId) || !state.submittedIds.includes(targetId)) return state;
      const nextVotes = { ...state.votes, [playerId]: targetId };
      const nextState: DrawGameState = {
        ...state,
        votes: nextVotes,
      };
      if (allConnectedDone(ctx, (id) => Boolean(nextVotes[id]))) {
        return tallyResults(ctx, nextState);
      }
      return nextState;
    }

    return handleRoundControl(ctx, state, action);
  },

  onHostAction(ctx, state, action) {
    return handleRoundControl(ctx, state, action);
  },

  onTimerExpired(ctx, state) {
    if (state.phase === 'PROMPTING') {
      const fallback = FALLBACK_PROMPTS[Math.floor(Math.random() * FALLBACK_PROMPTS.length)];
      return startDrawingPhase(ctx, state, fallback);
    }
    if (state.phase === 'DRAWING') {
      return startVotingPhase(ctx, state);
    }
    if (state.phase === 'VOTING') {
      return tallyResults(ctx, state);
    }
    return state;
  },

  onPlayerDisconnect(ctx, state, playerId) {
    return handlePlayerExit(ctx, state, playerId);
  },

  onPlayerLeave(ctx, state, playerId) {
    const votes: Record<string, string> = {};
    for (const [voterId, targetId] of Object.entries(state.votes)) {
      if (voterId !== playerId && targetId !== playerId) {
        votes[voterId] = targetId;
      }
    }
    const cleaned: DrawGameState = {
      ...state,
      drawings: withoutKey(state.drawings, playerId),
      submittedIds: state.submittedIds.filter((id) => id !== playerId),
      votes,
    };
    return handlePlayerExit(ctx, cleaned, playerId);
  },

  getHostView(state, ctx) {
    const prompter = ctx.getPlayer(state.prompterId);
    return {
      round: state.round,
      phase: state.phase,
      prompterId: state.prompterId,
      prompterName: prompter?.name ?? 'Player',
      prompt: state.prompt,
      voteMode: state.voteMode,
      entries: state.phase === 'DRAWING' || state.phase === 'VOTING' ? buildEntries(state, ctx) : [],
      votedPlayerIds: Object.keys(state.votes),
      results: state.results,
    };
  },

  getPlayerView(state, playerId, ctx) {
    const prompter = ctx.getPlayer(state.prompterId);
    const votableEntries =
      state.phase === 'VOTING'
        ? buildEntries(state, ctx).filter((entry) => entry.playerId !== playerId)
        : [];
    return {
      round: state.round,
      phase: state.phase,
      isPrompter: state.prompterId === playerId,
      prompterName: prompter?.name ?? 'Player',
      prompt: state.prompt,
      hasSubmitted: state.submittedIds.includes(playerId),
      voteMode: state.voteMode,
      hasVoted: Boolean(state.votes[playerId]),
      votedForId: state.votes[playerId] ?? null,
      votableEntries,
      results: state.results,
    };
  },
};
