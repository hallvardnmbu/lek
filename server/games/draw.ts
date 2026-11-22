import type {
  DrawAction,
  DrawEntry,
  DrawHostView,
  DrawPhase,
  DrawPlayerView,
  DrawVoteMode,
  DrawVoteResult,
} from '../../shared/games/draw';
import type { GameContext, GameDefinition, GamePlayer } from '../game';

export const PROMPT_DURATION_MS = 45_000;
export const DRAW_DURATION_MS = 90_000;
export const VOTE_DURATION_MS = 30_000;
const MAX_PROMPT_LENGTH = 60;
const MAX_IMAGE_DATA_LENGTH = 200_000;
const WIN_POINTS = 100;

const FALLBACK_PROMPTS = [
  'A cat riding a skateboard',
  'An alien eating pizza',
  'A robot walking a dog',
  'A penguin at the beach',
  'A wizard making coffee',
];

export interface DrawGameState {
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

function getConnectedPlayers(ctx: GameContext): GamePlayer[] {
  const connected = ctx.getPlayers().filter((p) => p.connected);
  return connected.length > 0 ? connected : ctx.getPlayers();
}

function pickRandomPrompter(ctx: GameContext, excludeId?: string): string {
  const pool = getConnectedPlayers(ctx);
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
  const counts = new Map<string, number>();
  for (const targetId of Object.values(state.votes)) {
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }

  let maxVotes = 0;
  for (const count of counts.values()) {
    if (count > maxVotes) maxVotes = count;
  }

  const results: DrawVoteResult[] = ctx
    .getPlayers()
    .map((p) => {
      const votes = counts.get(p.id) ?? 0;
      const isWinner = maxVotes > 0 && votes === maxVotes;
      if (isWinner) {
        ctx.addPlayerScore(p.id, WIN_POINTS);
      }
      return {
        playerId: p.id,
        playerName: p.name,
        imageData: state.drawings[p.id] ?? '',
        votes,
        isWinner,
      };
    })
    .sort((a, b) => b.votes - a.votes);

  return {
    ...state,
    phase: 'RESULTS',
    results,
  };
}

function allConnectedSubmitted(ctx: GameContext, submittedIds: string[]): boolean {
  const active = getConnectedPlayers(ctx);
  return active.length > 0 && active.every((p) => submittedIds.includes(p.id));
}

function allConnectedVoted(ctx: GameContext, votes: Record<string, string>): boolean {
  const active = getConnectedPlayers(ctx);
  return active.length > 0 && active.every((p) => Boolean(votes[p.id]));
}

export const drawGame: GameDefinition<DrawGameState, DrawHostView, DrawPlayerView, DrawAction> = {
  id: 'draw',
  name: 'Draw It',
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
      if (allConnectedSubmitted(ctx, nextSubmitted)) {
        return startVotingPhase(ctx, nextState);
      }
      return nextState;
    }

    if (action.type === 'cast_vote' && state.phase === 'VOTING') {
      const targetId = action.payload?.targetPlayerId;
      if (typeof targetId !== 'string' || targetId === playerId) return state;
      if (!ctx.getPlayer(targetId)) return state;
      const nextVotes = { ...state.votes, [playerId]: targetId };
      const nextState: DrawGameState = {
        ...state,
        votes: nextVotes,
      };
      if (allConnectedVoted(ctx, nextVotes)) {
        return tallyResults(ctx, nextState);
      }
      return nextState;
    }

    if (action.type === 'next_round' && state.phase === 'RESULTS') {
      return startPromptPhase(ctx, state.round + 1, state.prompterId);
    }

    if (action.type === 'finish_game' && state.phase === 'RESULTS') {
      ctx.endGame();
      return state;
    }

    return state;
  },

  onHostAction(ctx, state, action) {
    if (action.type === 'next_round' && state.phase === 'RESULTS') {
      return startPromptPhase(ctx, state.round + 1, state.prompterId);
    }
    if (action.type === 'finish_game' && state.phase === 'RESULTS') {
      ctx.endGame();
      return state;
    }
    return state;
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
    if (state.phase === 'PROMPTING' && state.prompterId === playerId) {
      const nextPrompterId = pickRandomPrompter(ctx, playerId);
      if (nextPrompterId && nextPrompterId !== playerId) {
        return { ...state, prompterId: nextPrompterId };
      }
    }
    if (state.phase === 'DRAWING' && allConnectedSubmitted(ctx, state.submittedIds)) {
      return startVotingPhase(ctx, state);
    }
    if (state.phase === 'VOTING' && allConnectedVoted(ctx, state.votes)) {
      return tallyResults(ctx, state);
    }
    return state;
  },

  onPlayerLeave(ctx, state, playerId) {
    if (state.phase === 'PROMPTING' && state.prompterId === playerId) {
      const nextPrompterId = pickRandomPrompter(ctx, playerId);
      if (nextPrompterId && nextPrompterId !== playerId) {
        return { ...state, prompterId: nextPrompterId };
      }
    }
    if (state.phase === 'DRAWING' && allConnectedSubmitted(ctx, state.submittedIds)) {
      return startVotingPhase(ctx, state);
    }
    if (state.phase === 'VOTING' && allConnectedVoted(ctx, state.votes)) {
      return tallyResults(ctx, state);
    }
    return state;
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
